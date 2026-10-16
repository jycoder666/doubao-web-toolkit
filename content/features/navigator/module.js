// navigator/module.js — 对话导航: 提取用户问题 → 侧边快速跳转
// 顶部维护:
//   - 2026-10-16 美化: 宽 200px / 字号 12px / 圆角徽标序号 / hover 微动效 /
//     折叠按钮 / 底部分数统计 / backdrop 毛玻璃 / 自定义细滚动条。
//   - 定位右侧 (豆包左侧有 280px 会话栏), top:84px 避开顶部栏。
//   - 打开对话时自动从顶扫到底，一次收齐当前会话里已加载的用户提问。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const PANEL_ID = 'dwt-nav';
  const STYLE_ID = 'dwt-nav-style';

  let navList = [];
  let keyword = '';
  let collapsed = false;

  let scanning = false;

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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      }
      #dwt-nav .dwt-nav-header { color:#1f2328; }
      #dwt-nav .dwt-nav-collapse { color:#8b949e; }
      #dwt-nav .dwt-nav-collapse:hover { background:#f0f2f5; }
      #dwt-nav .dwt-nav-search { border:1px solid #d0d7de; color:#1f2328; background:#fff; }
      #dwt-nav .dwt-nav-search::placeholder { color:#8b949e; }
      #dwt-nav .dwt-nav-search:focus { border-color:#2d72de; box-shadow:0 0 0 3px rgba(45,114,222,.15); }
      #dwt-nav .dwt-nav-footer { border-top-color:#f0f2f5; color:#8b949e; }
      #dwt-nav .dwt-nav-rows { overflow-x:hidden; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar { width:4px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-thumb { background:#d0d7de; border-radius:2px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-track { background:transparent; }
      #dwt-nav .dwt-nav-row {
        display:flex; align-items:center; gap:6px;
        padding:5px 6px; border-radius:6px; cursor:pointer;
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
    if (footer) footer.textContent = scanning ? '正在读取全部提问…' : ('共 ' + navList.length + ' 条');
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
  function waitForWindow(previousKey, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const now = visibleTexts().join('\n');
        const elapsed = Date.now() - start;
        if ((previousKey && now !== previousKey && elapsed >= 40) || elapsed >= timeout) resolve(now);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  async function jumpTo(text) {
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

  // 从顶扫到底。步长小于一屏，保证相邻窗口有重叠，漏掉的气泡不会被接丢。
  async function sweep(sc) {
    let texts = [];
    let y = 0;
    let guard = 0;
    let prev = '';
    while (guard++ < 160) {
      nudge(sc, y);
      prev = await waitForWindow(prev, y === 0 ? 700 : 280);
      texts = mergeTexts(texts, visibleTexts());
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      if (y >= max - 2) break;
      y = Math.min(max, y + stepSize(sc));
    }
    return texts;
  }

  // 豆包把“用户滚到顶”才当成要拉更早的消息。程序改 scrollTop 不会触发，要走它自己的滚动回调。
  function requestOlder(sc) {
    const fiberKey = Object.keys(sc).find((k) => k.startsWith('__reactFiber'));
    let fiber = fiberKey ? sc[fiberKey] : null;
    for (let i = 0; fiber && i < 8; i++) {
      const node = fiber.stateNode;
      const fn = node && node.props && node.props.onScroll;
      if (typeof fn === 'function' && String(fn).indexOf('isUserScrolling') >= 0) {
        try {
          fn.call(node, { x: 0, y: 0 }, { forward: false, isUserScrolling: true, isMouseDown: false });
          return;
        } catch (e) { /* 页面改版后走滚轮兜底 */ }
      }
      fiber = fiber.return;
    }
    sc.dispatchEvent(new WheelEvent('wheel', { deltaY: -800, bubbles: true, cancelable: true }));
  }

  async function pullOlder(sc) {
    const before = sc.scrollHeight;
    nudge(sc, 0);
    requestOlder(sc);
    await sleep(1000);
    return sc.scrollHeight > before + 80;
  }

  async function loadAll() {
    if (scanning) return;
    const sc = getScroller();
    if (!sc || sc.scrollHeight <= sc.clientHeight + 40) {
      navList = visibleTexts().map((text) => ({ text }));
      if (navList.length && !document.getElementById(PANEL_ID)) mount();
      else { renderItems(); markCurrent(); }
      return;
    }
    scanning = true;
    renderItems();
    const saved = sc.scrollTop;
    let texts = [];
    try {
      let pulls = 0;
      do {
        const pass = await sweep(sc);
        if (pass.length >= texts.length) texts = pass;
        pulls++;
      } while (pulls < 8 && await pullOlder(sc));
    } finally {
      nudge(sc, saved);
      navList = texts.map((text) => ({ text }));
      scanning = false;
    }
    if (navList.length && !document.getElementById(PANEL_ID)) mount();
    else { renderItems(); markCurrent(); }
  }

  function mount() {
    if (!navList.length) navList = visibleTexts().map((text) => ({ text }));
    if (!navList.length) {
      const old = document.getElementById(PANEL_ID);
      if (old) old.remove();
      return;
    }
    injectStyles();
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const nav = document.createElement('div');
    nav.id = PANEL_ID;
    // 双保险: inline style 保证面板可见 (即使 injectStyles 因故没跑),
    // CSS class (.dwt-nav-dark) 负责深色切换
    nav.style.cssText = 'position:fixed;right:12px;top:84px;z-index:999998;width:200px;max-height:70vh;'
      + 'display:flex;flex-direction:column;'
      + 'background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);'
      + 'border:1px solid rgba(0,0,0,0.06);border-radius:12px;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);'
      + 'padding:10px;transition:max-height .25s ease, opacity .2s ease;';
    if (collapsed) nav.classList.add('dwt-nav-collapsed');

    nav.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
      + '<div style="font-size:13px;font-weight:600;color:#1f2328;letter-spacing:.2px;">\u{1F4CC} 导航</div>'
      + '<span id="dwt-nav-collapse" style="cursor:pointer;font-size:14px;color:#8b949e;'
      + 'padding:2px 6px;border-radius:4px;" '
      + 'onmouseover="this.style.background=\'#f0f2f5\'" onmouseout="this.style.background=\'transparent\'">'
      + (collapsed ? '\u25B6' : '\u25C0') + '</span>'
      + '</div>'
      + '<div class="dwt-nav-body">'
      + '<input id="dwt-nav-search" type="text" placeholder="\u{1F50D} 搜索提问…" '
      + 'style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:6px 10px;border:1px solid #d0d7de;'
      + 'border-radius:8px;font-size:12px;color:#1f2328;background:#fff;outline:none;'
      + 'transition:border-color .15s, box-shadow .15s;"'
      + 'onfocus="this.style.borderColor=\'#2d72de\';this.style.boxShadow=\'0 0 0 3px rgba(45,114,222,.15)\'"'
      + 'onblur="this.style.borderColor=\'#d0d7de\';this.style.boxShadow=\'none\'">'
      + '<div class="dwt-nav-rows" style="overflow-y:auto;overflow-x:hidden;flex:1;"></div>'
      + '</div>'
      + '<div class="dwt-nav-footer" style="padding-top:6px;margin-top:6px;border-top:1px solid #f0f2f5;'
      + 'font-size:10px;color:#8b949e;text-align:center;"></div>';

    document.body.appendChild(nav);
    applyDark();

    const collapse = nav.querySelector('#dwt-nav-collapse');
    collapse.addEventListener('click', () => {
      collapsed = !collapsed;
      nav.classList.toggle('dwt-nav-collapsed', collapsed);
      collapse.textContent = collapsed ? '\u25B6' : '\u25C0';
    });

    const search = nav.querySelector('#dwt-nav-search');
    search.value = keyword;
    search.addEventListener('input', (e) => { keyword = e.target.value; renderItems(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());

    nav.addEventListener('click', (e) => {
      const el = e.target.closest('[data-idx]');
      if (!el) return;
      const idx = Number(el.dataset.idx);
      const item = navList[idx];
      if (item && item.text) jumpTo(item.text);
    });

    renderItems();
    markCurrent();
  }

  dwt.navigatorModule = {
    mount, collectUserQuestions,
    setKeyword(k) { keyword = k || ''; renderItems(); },
    markCurrent,
  };

  // 必须先声明。document_idle 时 readyState 已不是 loading，会立刻调用 startLiveWatch。
  let liveObserver = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); startLiveWatch(); loadAll(); });
  } else {
    mount();
    startLiveWatch();
    loadAll();
  }

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

  // 每次全量重扫 + 重绘 (因为豆包可能回收/重建气泡 node, 不能只比条数)
  let refreshTimer = null;
  function refreshList() {
    if (scanning) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const visible = visibleTexts();
      if (!visible.length) return;
      const merged = mergeTexts(navList.map((item) => item.text), visible);
      const changed = merged.length !== navList.length
        || merged.some((text, i) => navList[i]?.text !== text);
      if (!changed) { markCurrent(); return; }
      navList = merged.map((text) => ({ text }));
      const panel = document.getElementById(PANEL_ID);
      if (!panel) mount();
      else { renderItems(); markCurrent(); applyDark(); }
    }, 150);
  }
  // 滚动时更新"当前"高亮, 500ms 防抖
  let markTimer = null;
  document.addEventListener('scroll', () => {
    if (markTimer) clearTimeout(markTimer);
    markTimer = setTimeout(markCurrent, 500);
  }, true);

  console.log('[cs][doubao-web-toolkit] navigator module ready (beautified v2)');
})();
