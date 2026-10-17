// navigator/module.js — 对话导航: 提取用户问题 → 侧边快速跳转
// 顶部维护:
//   - 2026-10-16 美化: 宽 200px / 字号 12px / 圆角徽标序号 / hover 微动效 /
//     折叠按钮 / 底部分数统计 / backdrop 毛玻璃 / 自定义细滚动条。
//   - 定位右侧 (豆包左侧有 280px 会话栏), top:84px 避开顶部栏。
//   - 2026-10-17 采集去卡顿: 不再开机强制顶→底滚扫；优先 DOM/Fiber，
//     自然滚动 + MutationObserver 增量合并。
//   - 2026-10-17 rev5: 取消自动 softSweep（刷新后仍会顶→底拖滚动）；采集纯被动，
//     未挂载历史靠用户自然滚动补齐。软扫代码保留但默认不调度。
//   - 2026-10-17 rev6: 优先 CSS 美化豆包原生左侧 gutter（滑动已有标题浮层）；
//     检测到 gutter 则隐藏 #dwt-nav，只补刻度/浮层样式 + 轻量总数徽标。
//   - 2026-10-17 rev7: 将原生 gutter 用 CSS 挪到右侧（对齐原 #dwt-nav：right:12px），
//     继续隐藏自绘导航，仅美化原生刻度 + 浮层 + 总数。
//   - 2026-10-17 rev8: 修复 gutter CSS 过激导致原生消失、#dwt-nav 被卸掉后双无；
//     仅定位 aside[class*="gutter"]，可见性检查失败则回退面板。
//   - 2026-10-17 rev9: gutter 成功时不再 remove #dwt-nav（仅 CSS 隐藏）；同 rev 重注入
//     若面板缺失且非 gutter-ok 则强制 remount，避免 stub 循环后双无。
//   - 2026-10-17 rev10: gutter 挪右时强制 min-width:34px，避免 aside 塌成 ~3px；
//     美化失败则永久放弃 gutter、卸样式不残废原生，并强制 #dwt-nav 可见（不闪卸）。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  // 防重复注入：同 revision 再挂只同步 z-index；revision 升了则先 destroy 再装新逻辑
  const NAV_REV = 10;
  if (dwt.navigatorModule && dwt.navigatorModule.rev === NAV_REV) {
    console.log('[cs][doubao-web-toolkit] navigator already mounted, skip re-init');
    const existing = document.getElementById('dwt-nav');
    if (existing) {
      existing.style.zIndex = '200';
      existing.style.display = 'flex';
      existing.style.visibility = 'visible';
      existing.style.opacity = '1';
      existing.style.pointerEvents = 'auto';
      try {
        if (typeof dwt.navigatorModule.mode === 'function'
          && dwt.navigatorModule.mode() !== 'gutter-css') {
          document.documentElement.classList.remove('dwt-gutter-ok');
        }
      } catch (e) { /* ignore */ }
    } else {
      // 同 rev 热注入：面板被旧逻辑卸掉且 gutter 不可用时补挂，禁止双无
      try {
        const mode = typeof dwt.navigatorModule.mode === 'function'
          ? dwt.navigatorModule.mode()
          : '';
        const gutterOk = mode === 'gutter-css'
          && document.documentElement.classList.contains('dwt-gutter-ok')
          && !!document.querySelector('aside[class*="gutter"]');
        if (!gutterOk) {
          if (typeof dwt.navigatorModule.ensureNavAlive === 'function') {
            dwt.navigatorModule.ensureNavAlive();
          } else {
            dwt.navigatorModule.mount?.();
          }
        }
      } catch (e) { /* remount best-effort */ }
    }
    return;
  }
  if (dwt.navigatorModule) {
    try { dwt.navigatorModule.destroy?.(); } catch (e) { /* 旧版无 destroy 时忽略 */ }
    try {
      document.getElementById('dwt-nav')?.remove();
      document.getElementById('dwt-nav-style')?.remove();
      document.getElementById('dwt-gutter-style')?.remove();
      document.getElementById('dwt-gutter-count')?.remove();
    } catch (e) { /* DOM 清理失败不阻断重装 */ }
    dwt.navigatorModule = null;
  }

  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const PANEL_ID = 'dwt-nav';
  const STYLE_ID = 'dwt-nav-style';
  const GUTTER_STYLE_ID = 'dwt-gutter-style';
  const GUTTER_COUNT_ID = 'dwt-gutter-count';
  // 只认带 gutter 哈希的 aside，避免误伤其它 left-12 侧栏
  const SEL_GUTTER_ASIDE = 'aside[class*="gutter"]';
  const SEL_GUTTER_TICKS = 'aside[class*="gutter"] [class*="w-34"]';
  let navList = [];
  let keyword = '';
  let collapsed = false;
  // true = 尽量一屏铺开全部条目（仍受视口高度限制）；false = 紧凑高度
  let fitAll = true;

  let scanning = false;
  let scanGen = 0;           // 切换会话时自增，作废进行中的扫描
  let activeChatId = '';     // 当前 URL 里的 /chat/<id>
  let lastFullScanChatId = '';
  let lastFullScanAt = 0;
  let userInterruptGen = 0;  // 用户滚轮/触摸时自增（jumpTo 也会记一笔）

  function bubbleText(node) {
    return (node.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function visibleTexts() {
    const out = [];
    document.querySelectorAll(SEL_USER_BUBBLE).forEach((node) => {
      const text = bubbleText(node);
      if (text) out.push(text);
    });
    return out;
  }

  function sameSlice(a, a0, b, b0, n) {
    for (let i = 0; i < n; i++) {
      if (a[a0 + i] !== b[b0 + i]) return false;
    }
    return true;
  }

  // 虚拟列表每次只挂载视口附近的气泡。按重叠把新窗口接到已收集列表的头部或尾部。
  function mergeTexts(base, visible) {
    if (!visible.length) return base;
    if (!base.length) return visible.slice();
    if (visible.length <= base.length) {
      for (let i = 0; i <= base.length - visible.length; i++) {
        if (sameSlice(base, i, visible, 0, visible.length)) return base;
      }
    }
    const maxK = Math.min(base.length, visible.length);
    for (let k = maxK; k >= 1; k--) {
      if (sameSlice(base, base.length - k, visible, 0, k)) return base.concat(visible.slice(k));
    }
    for (let k = maxK; k >= 1; k--) {
      if (sameSlice(visible, visible.length - k, base, 0, k)) {
        return visible.slice(0, visible.length - k).concat(base);
      }
    }
    return base.concat(visible);
  }

  function getScroller() {
    const fromManager = dwt.selectorManager?.getScroller?.();
    if (fromManager) return fromManager;
    return document.querySelector('[class*="v_list_scroller"]');
  }

  function collectUserQuestions() {
    return navList.length
      ? navList.map((item) => ({ text: item.text }))
      : visibleTexts().map((text) => ({ text }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    // 浅色 (默认) + 深色 (body 背景偏暗时自动切换, 见 applyDark())
    st.textContent = `
      #dwt-nav {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background:rgba(255,255,255,0.96);
        border:1px solid rgba(0,0,0,0.06);
        box-shadow:0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
        color:#1f2328;
        overflow:hidden;
        box-sizing:border-box;
      }
      #dwt-nav .dwt-nav-body {
        display:flex; flex-direction:column; flex:1 1 auto;
        min-height:0; overflow:hidden;
      }
      #dwt-nav .dwt-nav-footer { flex-shrink:0; cursor:pointer; user-select:none; }
      #dwt-nav .dwt-nav-footer:hover { color:#2d72de; }
      #dwt-nav.dwt-nav-fitall .dwt-nav-rows { overflow-y:auto; }
      #dwt-nav .dwt-nav-header { color:#1f2328; }
      #dwt-nav .dwt-nav-collapse { color:#8b949e; }
      #dwt-nav .dwt-nav-collapse:hover { background:#f0f2f5; }
      #dwt-nav .dwt-nav-search { border:1px solid #d0d7de; color:#1f2328; background:#fff; }
      #dwt-nav .dwt-nav-search::placeholder { color:#8b949e; }
      #dwt-nav .dwt-nav-search:focus { border-color:#2d72de; box-shadow:0 0 0 3px rgba(45,114,222,.15); }
      #dwt-nav .dwt-nav-footer { border-top-color:#f0f2f5; color:#8b949e; }
      #dwt-nav .dwt-nav-rows {
        overflow-x:hidden; overflow-y:auto; flex:1 1 auto; min-height:0;
      }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar { width:4px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-thumb { background:#d0d7de; border-radius:2px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-track { background:transparent; }
      #dwt-nav .dwt-nav-row {
        display:flex; align-items:center; gap:5px;
        padding:3px 5px; border-radius:5px; cursor:pointer;
        transition: background .12s ease;
      }
      #dwt-nav .dwt-nav-row:hover { background:#f0f4ff; }
      #dwt-nav .dwt-nav-row.dwt-nav-current { background:#e8f0ff; color:#2d72de; }
      #dwt-nav .dwt-nav-num {
        flex-shrink:0; width:20px; height:20px; border-radius:50%;
        background:#f0f2f5; color:#656d76; font-size:10px; font-weight:600;
        display:flex; align-items:center; justify-content:center;
        transition: background .12s;
      }
      #dwt-nav .dwt-nav-row:hover .dwt-nav-num { background:#dde7ff; color:#2d72de; }
      #dwt-nav .dwt-nav-text {
        flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        color:#1f2328; font-size:12px; line-height:1.4;
      }
      #dwt-nav .dwt-nav-row.dwt-nav-current .dwt-nav-text { color:#1a56db; font-weight:500; }
      #dwt-nav .dwt-nav-empty { color:#8b949e; padding:6px; text-align:center; font-size:11px; }
      #dwt-nav.dwt-nav-collapsed .dwt-nav-body,
      #dwt-nav.dwt-nav-collapsed .dwt-nav-footer { display:none !important; }

      /* === 深色模式: !important 覆盖 inline style === */
      #dwt-nav.dwt-nav-dark {
        background:rgba(28,29,32,0.92) !important;
        border:1px solid rgba(255,255,255,0.1) !important;
        box-shadow:0 8px 28px rgba(0,0,0,0.6) !important;
        color:#e6e8ea !important;
      }
      #dwt-nav.dwt-nav-dark > div:first-child > div:first-child { color:#e6e8ea !important; } /* 标题 */
      #dwt-nav.dwt-nav-dark > div:first-child > span { color:#8b949e !important; } /* 折叠按钮 */
      #dwt-nav.dwt-nav-dark #dwt-nav-search {
        border:1px solid rgba(255,255,255,0.18) !important;
        color:#e6e8ea !important;
        background:rgba(255,255,255,0.05) !important;
      }
      #dwt-nav.dwt-nav-dark #dwt-nav-search::placeholder { color:#8b949e !important; }
      #dwt-nav.dwt-nav-dark #dwt-nav-search:focus {
        border-color:#4d8bf5 !important;
        box-shadow:0 0 0 3px rgba(77,139,245,.25) !important;
      }
      #dwt-nav.dwt-nav-dark .dwt-nav-footer {
        border-top:1px solid rgba(255,255,255,0.1) !important;
        color:#8b949e !important;
      }
      #dwt-nav.dwt-nav-dark .dwt-nav-rows::-webkit-scrollbar-thumb { background:#4b4d52; }
      #dwt-nav.dwt-nav-dark .dwt-nav-row:hover { background:rgba(255,255,255,0.06); }
      #dwt-nav.dwt-nav-dark .dwt-nav-row.dwt-nav-current { background:rgba(77,139,245,0.18); color:#4d8bf5; }
      #dwt-nav.dwt-nav-dark .dwt-nav-num { background:rgba(255,255,255,0.08); color:#9aa0a6; }
      #dwt-nav.dwt-nav-dark .dwt-nav-row:hover .dwt-nav-num { background:rgba(77,139,245,0.2); color:#4d8bf5; }
      #dwt-nav.dwt-nav-dark .dwt-nav-text { color:#e6e8ea; }
      #dwt-nav.dwt-nav-dark .dwt-nav-row.dwt-nav-current .dwt-nav-text { color:#7fb0ff; font-weight:500; }
      #dwt-nav.dwt-nav-dark .dwt-nav-empty { color:#8b949e; }
    `;
    document.head.appendChild(st);
  }

  // 检测深色: 读页面真实容器的背景亮度.
  // 不依赖 prefers-color-scheme —— 豆包可能自己切换主题而不响应系统设置.
  function isDarkNow() {
    try {
      // 优先: body 直接是纯色背景 (豆包浅色模式常见)
      let bg = getComputedStyle(document.body).backgroundColor;
      // 兜底: body 透明时, 从消息区容器往上找第一个非透明背景
      if (!bg || bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) {
        const candidates = document.querySelector('[class*="scroller"]')
                       || document.querySelector('[class*="message-list"]')
                       || document.querySelector('main');
        let el = candidates;
        while (el && el !== document.documentElement) {
          const c = getComputedStyle(el).backgroundColor;
          if (c && !c.startsWith('rgba(0, 0, 0, 0)') && c !== 'transparent') { bg = c; break; }
          el = el.parentElement;
        }
      }
      const m = bg?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return lum < 100;  // 经验阈值
      }
    } catch (e) { /* 忽略 */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  function applyDark() {
    try {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      const dark = isDarkNow();
      panel.classList.toggle('dwt-nav-dark', dark);
    } catch (e) { /* 深色检测失败不影响面板显示 */ }
  }

  function renderItems() {
    // 注: 这里用 class 选择器, 因为面板内容器是 class 不是 id
    const box = document.querySelector('#' + PANEL_ID + ' .dwt-nav-rows');
    if (!box) return;
    const kw = keyword.trim().toLowerCase();
    const rows = [];
    navList.forEach((q, i) => {
      if (kw && !q.text.toLowerCase().includes(kw)) return;
      rows.push(
        '<div class="dwt-nav-row" data-idx="' + i + '">'
        + '<span class="dwt-nav-num">' + (i + 1) + '</span>'
        + '<span class="dwt-nav-text">' + escapeHtml(q.text) + '</span>'
        + '</div>'
      );
    });
    box.innerHTML = rows.length ? rows.join('') : '<div style="color:#8b949e;padding:6px;text-align:center;font-size:11px;">无匹配</div>';
    const footer = document.querySelector('#' + PANEL_ID + ' .dwt-nav-footer');
    if (footer) {
      if (scanning) footer.textContent = '补全中… 已 ' + navList.length + ' 条';
      else {
        footer.textContent = '共 ' + navList.length + ' 条';
      }
    }
    applyFitAll();
  }

  // 铺开模式：面板随内容长高（上限为视口），能放下就整表可见不用滚；放不下才在列表内滚
  // 紧凑模式：列表固定约 6～7 行高度，底部「点击铺开全部」才有可见效果
  const COMPACT_ROWS_MAX = '168px';
  function applyFitAll() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || collapsed) return;
    const body = panel.querySelector('.dwt-nav-body');
    const rows = panel.querySelector('.dwt-nav-rows');
    panel.classList.toggle('dwt-nav-fitall', fitAll);
    // 最高不超过视口 60%，超出在列表内滚动
    panel.style.maxHeight = '60vh';
    if (fitAll) {
      panel.style.height = 'auto';
      if (body) body.style.flex = '0 1 auto';
      if (rows) {
        rows.style.flex = '0 1 auto';
        rows.style.maxHeight = 'none';
        rows.style.overflowY = 'auto';
      }
    } else {
      panel.style.height = '';
      if (body) body.style.flex = '1 1 auto';
      if (rows) {
        rows.style.flex = '1 1 auto';
        rows.style.maxHeight = COMPACT_ROWS_MAX;
        rows.style.overflowY = 'auto';
      }
    }
  }

  function toggleFitAll() {
    if (scanning) return;
    fitAll = !fitAll;
    applyFitAll();
    renderItems();
  }

  // 高亮当前视口内最靠上的用户提问 (让用户知道"当前读到哪一条")
  function markCurrent() {
    if (scanning) return;
    const rows = document.querySelectorAll('#dwt-nav .dwt-nav-row');
    if (!rows.length || !navList.length) return;
    const scroller = getScroller();
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    const viewH = scroller ? scroller.clientHeight : window.innerHeight;
    let currentText = '';
    document.querySelectorAll(SEL_USER_BUBBLE).forEach((node) => {
      if (currentText) return;
      const rel = node.getBoundingClientRect().top - viewTop;
      if (rel >= -40 && rel <= viewH) currentText = bubbleText(node);
    });
    const currentIdx = currentText ? navList.findIndex((item) => item.text === currentText) : -1;
    rows.forEach((row) => {
      if (currentIdx >= 0 && Number(row.dataset.idx) === currentIdx) {
        row.classList.add('dwt-nav-current');
      } else {
        row.classList.remove('dwt-nav-current');
      }
    });
  }

  function findBubble(text) {
    let found = null;
    document.querySelectorAll(SEL_USER_BUBBLE).forEach((node) => {
      if (!found && bubbleText(node) === text) found = node;
    });
    return found;
  }

  function highlight(node) {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const orig = node.style.outline;
    node.style.outline = '2px solid #2d72de';
    node.style.transition = 'outline .3s';
    setTimeout(() => { node.style.outline = orig; }, 1500);
  }

  function stepSize(sc) {
    return Math.max(160, Math.floor(sc.clientHeight * 0.45));
  }

  function nudge(sc, y) {
    sc.scrollTop = y;
    sc.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  // 虚拟列表不会在改 scrollTop 的同一帧换气泡，等到文本变了或超时再采样。
  function waitForWindow(previousKey, timeout, shouldAbort) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (shouldAbort && shouldAbort()) {
          resolve(visibleTexts().join('\n'));
          return;
        }
        const now = visibleTexts().join('\n');
        const elapsed = Date.now() - start;
        if ((previousKey && now !== previousKey && elapsed >= 40) || elapsed >= timeout) resolve(now);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function noteUserInterrupt() {
    userInterruptGen++;
  }

  function bindUserInterrupt(sc) {
    if (!sc || sc._dwtNavInterruptBound) return;
    sc._dwtNavInterruptBound = true;
    const opts = { passive: true, capture: true };
    sc.addEventListener('wheel', noteUserInterrupt, opts);
    sc.addEventListener('touchstart', noteUserInterrupt, opts);
    sc.addEventListener('pointerdown', noteUserInterrupt, opts);
  }

  // 从 React fiber / props 里尽量抽出用户提问，避免为虚拟列表强制滚扫。
  // 启发式：带 role/user 标记的消息，或 content/text 字段；深度与条数有硬上限。
  function tryHarvestFromFiber(sc) {
    if (!sc) return [];
    const fiberKey = Object.keys(sc).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fiberKey) return [];
    const out = [];
    const seen = new Set();
    const pushText = (raw) => {
      if (typeof raw !== 'string') return;
      const t = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!t || t.length < 1 || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    const looksUser = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      const role = obj.role || obj.author || obj.sender || obj.from || obj.type || obj.message_type;
      if (role == null) return false;
      const s = String(role).toLowerCase();
      return s === 'user' || s === 'human' || s === 'self' || s === '1'
        || s.indexOf('user') >= 0 || s.indexOf('human') >= 0;
    };
    const takeFromMsg = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (!looksUser(obj)) return;
      const c = obj.content ?? obj.text ?? obj.message ?? obj.prompt ?? obj.query;
      if (typeof c === 'string') pushText(c);
      else if (Array.isArray(c)) {
        c.forEach((part) => {
          if (typeof part === 'string') pushText(part);
          else if (part && typeof part.text === 'string') pushText(part.text);
          else if (part && typeof part.content === 'string') pushText(part.content);
        });
      } else if (c && typeof c === 'object' && typeof c.text === 'string') pushText(c.text);
    };
    const scanArray = (arr, depth) => {
      if (!Array.isArray(arr) || depth > 4 || out.length > 200) return;
      if (arr.length < 2 || arr.length > 500) return;
      for (let i = 0; i < arr.length && out.length <= 200; i++) {
        const item = arr[i];
        if (typeof item === 'string') continue;
        takeFromMsg(item);
        if (item && typeof item === 'object') {
          if (item.message) takeFromMsg(item.message);
          if (item.data) takeFromMsg(item.data);
        }
      }
    };
    const visitProps = (props, depth) => {
      if (!props || depth > 3 || out.length > 200) return;
      for (const key of Object.keys(props)) {
        if (key === 'children' || key === 'ref' || key.startsWith('__')) continue;
        const val = props[key];
        if (Array.isArray(val)) scanArray(val, depth + 1);
        else if (val && typeof val === 'object' && Array.isArray(val.list)) scanArray(val.list, depth + 1);
        else if (val && typeof val === 'object' && Array.isArray(val.messages)) scanArray(val.messages, depth + 1);
        else if (val && typeof val === 'object' && Array.isArray(val.items)) scanArray(val.items, depth + 1);
      }
    };
    let fiber = sc[fiberKey];
    let walked = 0;
    // 先沿 return 链找列表数据（虚拟 scroller 的父级常挂 dataSource）
    for (let i = 0; fiber && i < 12; i++) {
      visitProps(fiber.memoizedProps || fiber.pendingProps, 0);
      fiber = fiber.return;
      walked++;
      if (out.length >= 3) break;
    }
    // 不够再浅扫 child 子树
    if (out.length < 3) {
      fiber = sc[fiberKey];
      const stack = fiber ? [fiber.child] : [];
      while (stack.length && walked < 80 && out.length < 200) {
        const f = stack.pop();
        if (!f) continue;
        walked++;
        visitProps(f.memoizedProps || f.pendingProps, 0);
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    return out;
  }

  async function jumpTo(text) {
    noteUserInterrupt(); // 用户主动跳转：停掉后台软扫，避免抢滚
    let node = findBubble(text);
    const sc = getScroller();
    if (!node && sc) {
      const step = stepSize(sc);
      let y = 0;
      let guard = 0;
      let lastH = -1;
      let stuck = 0;
      let prev = '';
      while (!node && guard++ < 160) {
        nudge(sc, y);
        prev = await waitForWindow(prev, 280);
        node = findBubble(text);
        if (node) break;
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        if (y >= max - 2) {
          if (sc.scrollHeight === lastH) stuck++;
          else stuck = 0;
          lastH = sc.scrollHeight;
          if (stuck >= 2) break;
          y = 0;
        } else {
          lastH = sc.scrollHeight;
          y = Math.min(max, y + step);
        }
      }
    }
    if (node) highlight(node);
  }

  function getChatId() {
    const m = String(location.pathname || '').match(/\/chat\/(\d+)/);
    return m ? m[1] : '';
  }

  function applyScanResult(texts) {
    // 扫描失败/中断时至少展示当前视口已有气泡，避免导航永久空白
    let merged = texts && texts.length ? texts.slice() : [];
    merged = mergeTexts(merged, visibleTexts());
    navList = merged.map((text) => ({ text }));
    if (!document.getElementById(PANEL_ID)) mount();
    else { renderItems(); markCurrent(); }
  }

  // 主入口：只用 DOM(+Fiber) 填表，绝不自动改 scrollTop。
  // 虚拟列表未挂载的更早提问：等用户自然滚动，由 onScrollMark / MutationObserver 合并。
  function postNavBeacon(extra) {
    try {
      const body = JSON.stringify(Object.assign({
        href: String(location.href || ''),
        nav: !!document.getElementById(PANEL_ID),
        navRev: NAV_REV,
        autoScrollSweep: false,
        navCount: navList.length,
        reason: 'navigator-loadAll',
        t: Date.now(),
      }, extra || {}));
      const urls = [
        'http://127.0.0.1:5181/dev/bridge/verify',
        'http://127.0.0.1:5179/dev/bridge/verify',
      ];
      urls.forEach((u) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            navigator.sendBeacon(u, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
          }
          fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, mode: 'cors', keepalive: true }).catch(() => {});
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

  async function loadAll() {
    const gen = ++scanGen;
    const chatAtStart = getChatId();
    activeChatId = chatAtStart || activeChatId;

    try { dwt.selectorManager?.invalidate?.(); } catch (e) { /* 无 selectorManager 时忽略 */ }
    const sc = getScroller();
    if (sc) bindUserInterrupt(sc);

    let texts = visibleTexts();
    const fiberTexts = tryHarvestFromFiber(sc);
    if (fiberTexts.length) texts = mergeTexts(fiberTexts, texts);

    if (gen !== scanGen) return;
    scanning = false;
    applyScanResult(texts);
    lastFullScanChatId = chatAtStart;
    lastFullScanAt = Date.now();
    renderItems();
    postNavBeacon({ fiberCount: fiberTexts.length });
  }

  // 豆包 SPA：点左侧其他会话只改 URL/DOM，不整页刷新。必须重扫导航。
  function onChatSwitch(nextId) {
    if (nextId && nextId === activeChatId) return;
    activeChatId = nextId || '';
    scanGen++;
    scanning = false;
    keyword = '';
    navList = [];
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const search = panel.querySelector('#dwt-nav-search');
      if (search) search.value = '';
      renderItems();
    }
    // 等新会话气泡挂上再被动采集（绝不强制顶→底滚）
    setTimeout(() => {
      if (getChatId() !== activeChatId) return;
      loadAll();
    }, 450);
  }

  function watchRouteChange() {
    activeChatId = getChatId();
    let lastHref = location.href;
    const check = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      onChatSwitch(getChatId());
    };
    setInterval(check, 500);
    window.addEventListener('popstate', check);
    const wrap = (fn) => function () {
      const ret = fn.apply(this, arguments);
      setTimeout(check, 0);
      return ret;
    };
    try {
      history.pushState = wrap(history.pushState.bind(history));
      history.replaceState = wrap(history.replaceState.bind(history));
    } catch (e) { /* 部分环境不可改写 history */ }
  }

  function mount() {
    // 热更新后旧闭包的 observer 仍可能回调 mount：若已被新 revision 接管则不再建面板
    if (dwt.navigatorModule && dwt.navigatorModule.mount !== mount) return;
    if (!navList.length) navList = visibleTexts().map((text) => ({ text }));
    // 空列表也保留 #dwt-nav 壳（显示「暂无提问」），避免 live-boot 验收永远等不到节点；
    // 有气泡后再 renderItems 填入。
    injectStyles();
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const nav = document.createElement('div');
    nav.id = PANEL_ID;
    // 双保险: inline style 保证面板可见 (即使 injectStyles 因故没跑),
    // CSS class (.dwt-nav-dark) 负责深色切换
    // z-index below Doubao native popovers/menus (often ~1000+) so they are not covered
    nav.style.cssText = 'position:fixed;right:12px;top:84px;z-index:200;width:200px;'
      + 'max-height:60vh;'
      + 'display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;'
      + 'visibility:visible;opacity:1;pointer-events:auto;'
      + 'background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);'
      + 'border:1px solid rgba(0,0,0,0.06);border-radius:12px;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);'
      + 'padding:8px;transition:max-height .25s ease, opacity .2s ease;';
    if (collapsed) nav.classList.add('dwt-nav-collapsed');
    if (fitAll) nav.classList.add('dwt-nav-fitall');

    nav.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">'
      + '<div style="font-size:13px;font-weight:600;color:#1f2328;letter-spacing:.2px;">\u{1F4CC} 导航</div>'
      + '<span id="dwt-nav-collapse" style="cursor:pointer;font-size:14px;color:#8b949e;'
      + 'padding:2px 6px;border-radius:4px;" '
      + 'onmouseover="this.style.background=\'#f0f2f5\'" onmouseout="this.style.background=\'transparent\'">'
      + (collapsed ? '\u25B6' : '\u25C0') + '</span>'
      + '</div>'
      + '<div class="dwt-nav-body" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden;">'
      + '<input id="dwt-nav-search" type="text" placeholder="\u{1F50D} 搜索提问…" '
      + 'style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:6px 10px;border:1px solid #d0d7de;'
      + 'border-radius:8px;font-size:12px;color:#1f2328;background:#fff;outline:none;flex-shrink:0;'
      + 'transition:border-color .15s, box-shadow .15s;"'
      + 'onfocus="this.style.borderColor=\'#2d72de\';this.style.boxShadow=\'0 0 0 3px rgba(45,114,222,.15)\'"'
      + 'onblur="this.style.borderColor=\'#d0d7de\';this.style.boxShadow=\'none\'">'
      + '<div class="dwt-nav-rows" style="overflow-y:auto;overflow-x:hidden;flex:1 1 auto;min-height:0;"></div>'
      + '</div>'
      + '<div class="dwt-nav-footer" title="点击切换：铺开全部 / 收起高度" style="padding-top:6px;margin-top:6px;border-top:1px solid #f0f2f5;'
      + 'font-size:10px;color:#8b949e;text-align:center;flex-shrink:0;cursor:pointer;"></div>';

    const host = document.body || document.documentElement;
    if (!host) return;
    host.appendChild(nav);
    applyDark();
    applyFitAll();

    const collapse = nav.querySelector('#dwt-nav-collapse');
    collapse.addEventListener('click', () => {
      collapsed = !collapsed;
      nav.classList.toggle('dwt-nav-collapsed', collapsed);
      collapse.textContent = collapsed ? '\u25B6' : '\u25C0';
      if (!collapsed) applyFitAll();
    });

    const search = nav.querySelector('#dwt-nav-search');
    search.value = keyword;
    search.addEventListener('input', (e) => { keyword = e.target.value; renderItems(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());

    // 页脚切换与行跳转共用面板委托，避免 footer 节点被改写后丢监听；
    // stopPropagation 减少宿主页全局 click 抢事件
    nav.addEventListener('click', (e) => {
      if (e.target.closest('.dwt-nav-footer')) {
        e.stopPropagation();
        toggleFitAll();
        return;
      }
      const el = e.target.closest('[data-idx]');
      if (!el) return;
      e.stopPropagation();
      const idx = Number(el.dataset.idx);
      const item = navList[idx];
      if (item && item.text) jumpTo(item.text);
    });

    renderItems();
    markCurrent();
  }

  // 必须先声明。document_idle 时 readyState 已不是 loading，会立刻调用 startLiveWatch。
  let liveObserver = null;
  let refreshTimer = null;
  let markTimer = null;

  function onScrollMark() {
    if (markTimer) clearTimeout(markTimer);
    markTimer = setTimeout(() => {
      // 自然滚动时顺带合并视口气泡（虚拟列表换窗主要靠这个补齐）
      if (!scanning) mergeVisibleIntoList();
      markCurrent();
    }, 180);
  }

  // 把当前挂载的用户气泡并入 navList（不改 scrollTop）
  function mergeVisibleIntoList() {
    const visible = visibleTexts();
    if (!visible.length) return false;
    const oldTexts = navList.map((item) => item.text);
    if (oldTexts.length && visible.filter((t) => oldTexts.indexOf(t) >= 0).length === 0) {
      // 与旧列表无交集：多半换会话，交给 refreshList / onChatSwitch
      return false;
    }
    const merged = mergeTexts(oldTexts, visible);
    const changed = merged.length !== navList.length
      || merged.some((text, i) => navList[i]?.text !== text);
    if (!changed) return false;
    navList = merged.map((text) => ({ text }));
    const panel = document.getElementById(PANEL_ID);
    if (!panel) mount();
    else { renderItems(); applyDark(); }
    return true;
  }

  function findNativeGutter() {
    return document.querySelector(SEL_GUTTER_ASIDE) || document.querySelector(SEL_GUTTER_TICKS);
  }

  function findTickColumn() {
    return document.querySelector(SEL_GUTTER_TICKS);
  }

  function injectGutterBeautifyCss() {
    let st = document.getElementById(GUTTER_STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = GUTTER_STYLE_ID;
      (document.head || document.documentElement).appendChild(st);
    }
    // 挪右 + 保宽：left:auto/right 易把绝对定位 aside 塌成 ~3px，必须 min-width
    st.textContent = `
      html.dwt-native-gutter aside[class*="gutter"] {
        left: auto !important;
        right: 12px !important;
        top: 72px !important;
        bottom: 16px !important;
        z-index: 100 !important;
        margin: 0 !important;
        width: auto !important;
        min-width: 34px !important;
        max-width: 48px !important;
        pointer-events: auto !important;
      }
      html.dwt-native-gutter aside[class*="gutter"] [class*="w-34"] {
        gap: 8px !important;
        width: 34px !important;
        min-width: 34px !important;
        pointer-events: auto !important;
      }
      html.dwt-native-gutter aside[class*="gutter"] [class*="w-34"] > * {
        min-height: 4px !important;
        min-width: 12px !important;
        border-radius: 2px !important;
        opacity: 0.65 !important;
        transition: opacity .15s ease, transform .15s ease, box-shadow .15s ease !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      html.dwt-native-gutter aside[class*="gutter"] [class*="w-34"] > *:hover {
        opacity: 1 !important;
        transform: scaleX(1.2);
        box-shadow: 0 0 0 1px rgba(255,255,255,.35);
      }
      #dwt-gutter-count {
        position: fixed;
        right: 56px;
        left: auto !important;
        bottom: 28px;
        z-index: 120;
        min-width: 52px;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        color: #e8eaed;
        background: rgba(32,36,42,.88);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 4px 16px rgba(0,0,0,.35);
        pointer-events: none;
        user-select: none;
      }
      /* 仅当 gutter 可见检查通过后才隐藏自绘导航（见 enableGutterMode） */
      html.dwt-native-gutter.dwt-gutter-ok #dwt-nav { display: none !important; }
    `;
  }

  function isGutterVisuallyOk() {
    const gut = findNativeGutter();
    const col = findTickColumn();
    if (!gut || !col || col.children.length < 1) return false;
    const r = gut.getBoundingClientRect();
    // 可读可点：至少接近原生 w-34；~3px 视为失败
    if (r.width < 12 || r.height < 80) return false;
    // 应在视口右半侧（挪右成功）；若仍贴左且几乎不可见也算失败
    if (r.right < window.innerWidth * 0.55 && r.width < 20) return false;
    if (r.top > window.innerHeight - 40 || r.bottom < 40) return false;
    return true;
  }

  /** position:fixed 的 offsetParent 恒为 null，用矩形判断面板是否在视口内 */
  function isPanelVisuallyOk() {
    const nav = document.getElementById(PANEL_ID);
    if (!nav) return false;
    const cs = window.getComputedStyle ? getComputedStyle(nav) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)) {
      return false;
    }
    const r = nav.getBoundingClientRect();
    if (r.width < 80 || r.height < 40) return false;
    if (r.bottom < 20 || r.top > window.innerHeight - 20) return false;
    if (r.right < 20 || r.left > window.innerWidth - 20) return false;
    return true;
  }

  function forcePanelVisible() {
    document.documentElement.classList.remove('dwt-gutter-ok');
    const nav = document.getElementById(PANEL_ID);
    if (!nav) return;
    nav.style.display = 'flex';
    nav.style.visibility = 'visible';
    nav.style.opacity = '1';
    nav.style.pointerEvents = 'auto';
    nav.style.zIndex = '200';
    if (!nav.style.position) nav.style.position = 'fixed';
  }

  function syncGutterCountBadge() {
    const col = findTickColumn();
    const gutter = findNativeGutter();
    if (!col || !gutter) {
      document.getElementById(GUTTER_COUNT_ID)?.remove();
      return;
    }
    const n = col.children.length;
    let badge = document.getElementById(GUTTER_COUNT_ID);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = GUTTER_COUNT_ID;
      badge.title = '原生导航刻度数（随拖拽加载增多）';
      (document.body || document.documentElement).appendChild(badge);
    }
    badge.textContent = '共 ' + n + ' 条';
    badge.style.left = 'auto';
    badge.style.right = '56px';
    badge.style.bottom = '28px';
  }

  let gutterMode = false;
  let gutterObserver = null;
  // 一次会话内美化失败则不再重试，避免反复 inject/remove 闪原生 / 闪面板
  let gutterGaveUp = false;

  function ensurePanelMounted() {
    if (!document.getElementById(PANEL_ID)) {
      mount();
      startLiveWatch();
      loadAll();
    }
  }

  /** 至少一种导航可见：gutter-ok 或 #dwt-nav 稳定在视口内 */
  function ensureNavAlive() {
    if (gutterMode && findNativeGutter() && isGutterVisuallyOk()) {
      document.documentElement.classList.add('dwt-gutter-ok');
      ensurePanelMounted(); // 保留 DOM，由 CSS 隐藏
      return;
    }
    if (gutterMode) {
      console.warn('[cs][doubao-web-toolkit] gutter not ok; fallback panel');
      gutterGaveUp = true;
      disableGutterMode();
    }
    ensurePanelMounted();
    forcePanelVisible();
    if (!isPanelVisuallyOk()) {
      // 不 remove 重建（防闪）；再推一次可见样式
      forcePanelVisible();
    }
  }

  function enableGutterMode() {
    if (gutterGaveUp) return false;
    if (!findNativeGutter()) return false;
    // 面板必须先存在：gutter 失败时立刻可见，成功时仅 CSS 隐藏（永不 remove）
    ensurePanelMounted();
    injectGutterBeautifyCss();
    document.documentElement.classList.add('dwt-native-gutter');
    document.documentElement.classList.remove('dwt-gutter-ok');
    // 等布局生效后再验可见性；通过才加 dwt-gutter-ok 隐藏面板
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isGutterVisuallyOk()) {
          console.warn('[cs][doubao-web-toolkit] gutter CSS move failed; keep #dwt-nav');
          gutterGaveUp = true;
          disableGutterMode();
          ensurePanelMounted();
          forcePanelVisible();
          return;
        }
        gutterMode = true;
        document.documentElement.classList.add('dwt-gutter-ok');
        // 故意不 remove #dwt-nav：stub inc()/同 rev 热注入依赖节点仍在
        syncGutterCountBadge();
        if (!gutterObserver) {
          gutterObserver = new MutationObserver(() => {
            if (!findNativeGutter() || !isGutterVisuallyOk()) {
              console.warn('[cs][doubao-web-toolkit] gutter lost; fallback panel');
              gutterGaveUp = true;
              disableGutterMode();
              ensurePanelMounted();
              forcePanelVisible();
              return;
            }
            syncGutterCountBadge();
          });
          const root = findNativeGutter();
          if (root) gutterObserver.observe(root, { childList: true, subtree: true });
        }
        console.log('[cs][doubao-web-toolkit] navigator gutter-css mode (nav-rev ' + NAV_REV + ')');
      });
    });
    return true;
  }

  function disableGutterMode() {
    gutterMode = false;
    document.documentElement.classList.remove('dwt-native-gutter');
    document.documentElement.classList.remove('dwt-gutter-ok');
    try { gutterObserver?.disconnect(); } catch (e) { /* ignore */ }
    gutterObserver = null;
    document.getElementById(GUTTER_COUNT_ID)?.remove();
    // 卸掉可能把原生 gutter 搞没的样式（恢复宿主布局）
    document.getElementById(GUTTER_STYLE_ID)?.remove();
  }

  function destroy() {
    scanGen++;
    scanning = false;
    try { liveObserver?.disconnect(); } catch (e) { /* ignore */ }
    liveObserver = null;
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (markTimer) { clearTimeout(markTimer); markTimer = null; }
    try { document.removeEventListener('scroll', onScrollMark, true); } catch (e) { /* ignore */ }
    disableGutterMode();
    try {
      document.getElementById(PANEL_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(GUTTER_STYLE_ID)?.remove();
    } catch (e) { /* ignore */ }
  }

  dwt.navigatorModule = {
    rev: NAV_REV,
    mode: function () { return gutterMode ? 'gutter-css' : 'panel'; },
    mount, collectUserQuestions, loadAll, destroy, toggleFitAll, applyFitAll,
    ensureNavAlive,
    setKeyword(k) { keyword = k || ''; renderItems(); },
    markCurrent,
  };

  function bootNav() {
    try {
      // 先挂面板保底，再尝试 gutter；可见性失败会自动回退面板（面板始终留在 DOM）
      mount();
      forcePanelVisible();
      startLiveWatch();
      watchRouteChange();
      loadAll();
      if (findNativeGutter() && !gutterGaveUp) enableGutterMode();
      setTimeout(function () {
        if (findNativeGutter() && !gutterMode && !gutterGaveUp) enableGutterMode();
        ensureNavAlive();
      }, 800);
      setTimeout(ensureNavAlive, 2000);
    } catch (e) {
      console.warn('[cs][doubao-web-toolkit] navigator boot failed', e);
      try { ensurePanelMounted(); forcePanelVisible(); } catch (e2) { /* ignore */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNav);
  } else {
    bootNav();
  }
  setTimeout(function () {
    if (!document.getElementById(PANEL_ID) && !gutterMode) bootNav();
    else ensureNavAlive();
  }, 400);
  // 轻量心跳：防止 SPA 重建 / 旧逻辑卸面板后双无
  setInterval(function () {
    try { ensureNavAlive(); } catch (e) { /* ignore */ }
  }, 3000);

  // MutationObserver: 监听气泡出现/变化, 实时追加到列表 (不用等 8 秒轮询)
  function startLiveWatch() {
    if (liveObserver) return;
    liveObserver = new MutationObserver((mutations) => {
      let dirty = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (n.matches?.(SEL_USER_BUBBLE) || n.querySelector?.(SEL_USER_BUBBLE))) {
              dirty = true; break;
            }
          }
        } else if (m.type === 'characterData') {
          // 流式输出中已有气泡内容变化 → 也算脏 (但不常触发, 节流)
        }
        if (dirty) break;
      }
      if (dirty) refreshList();
    });
    // 挂在 body 上, 监听整棵树
    liveObserver.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  // DOM 变化时增量合并（不强制滚扫）。豆包回收/重建气泡时靠 merge 叠窗。
  function refreshList() {
    if (scanning) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      // URL 已切会话但 interval 尚未跑到时，先按新 id 触发切换
      const id = getChatId();
      if (id && activeChatId && id !== activeChatId) {
        onChatSwitch(id);
        return;
      }
      const visible = visibleTexts();
      if (!visible.length) return;
      const oldTexts = navList.map((item) => item.text);
      // 与旧列表完全无交集 → 多半已换会话，禁止 merge 把两场对话拼在一起
      const overlap = visible.filter((t) => oldTexts.indexOf(t) >= 0).length;
      if (oldTexts.length && overlap === 0) {
        navList = visible.map((text) => ({ text }));
        const panel = document.getElementById(PANEL_ID);
        if (!panel) mount();
        else { renderItems(); markCurrent(); applyDark(); }
        // 无交集：被动 loadAll（DOM+Fiber；软扫可取消），冷却期内不连环触发
        const cool = Date.now() - lastFullScanAt < 8000 && lastFullScanChatId === id;
        if (!scanning && !cool) loadAll();
        return;
      }
      const merged = mergeTexts(oldTexts, visible);
      const changed = merged.length !== navList.length
        || merged.some((text, i) => navList[i]?.text !== text);
      if (!changed) { markCurrent(); return; }
      navList = merged.map((text) => ({ text }));
      const panel = document.getElementById(PANEL_ID);
      if (!panel) mount();
      else { renderItems(); markCurrent(); applyDark(); }
    }, 150);
  }
  // 滚动时：高亮当前 + 合并视口气泡
  document.addEventListener('scroll', onScrollMark, true);

  console.log('[cs][doubao-web-toolkit] navigator module ready (nav-rev ' + NAV_REV + ')');
})();
