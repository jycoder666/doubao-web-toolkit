// navigator/module.js — 对话导航: 提取用户问题 → 侧边快速跳转
// 顶部维护:
//   - 2026-10-16 美化: 宽 200px / 字号 12px / 圆角徽标序号 / hover 微动效 /
//     折叠按钮 / 底部分数统计 / backdrop 毛玻璃 / 自定义细滚动条。
//   - 定位右侧 (豆包左侧有 280px 会话栏), top:84px 避开顶部栏。
//   - 自动每 8 秒重扫一次提问列表, 适配流式输出场景。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const PANEL_ID = 'dwt-nav';
  const STYLE_ID = 'dwt-nav-style';

  let navList = [];
  let keyword = '';
  let collapsed = false;

  function collectUserQuestions() {
    const bubbles = document.querySelectorAll(SEL_USER_BUBBLE);
    const list = [];
    bubbles.forEach((b) => {
      const t = (b.innerText || '').trim();
      if (t) list.push({ text: t.slice(0, 80), node: b });
    });
    return list;
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
    if (footer) footer.textContent = '共 ' + navList.length + ' 条';
  }

  // 高亮当前视口内最靠上的用户提问 (让用户知道"当前读到哪一条")
  function markCurrent() {
    const rows = document.querySelectorAll('#dwt-nav .dwt-nav-row');
    if (!rows.length || !navList.length) return;
    // 找到视口内最靠上的用户节点
    const scroller = dwt.selectorManager?.getScroller?.();
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    const viewH = scroller ? scroller.clientHeight : window.innerHeight;
    let currentIdx = -1;
    for (let i = 0; i < navList.length; i++) {
      const r = navList[i].node.getBoundingClientRect();
      const rel = r.top - viewTop;
      if (rel >= -40 && rel <= viewH) { currentIdx = i; break; }
    }
    rows.forEach((row) => {
      if (currentIdx >= 0 && Number(row.dataset.idx) === currentIdx) {
        row.classList.add('dwt-nav-current');
      } else {
        row.classList.remove('dwt-nav-current');
      }
    });
  }

  function mount() {
    const list = collectUserQuestions();
    if (!list.length) {
      const old = document.getElementById(PANEL_ID);
      if (old) old.remove();
      return;
    }
    navList = list;
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
      if (item && item.node) {
        item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const orig = item.node.style.outline;
        item.node.style.outline = '2px solid #2d72de';
        item.node.style.transition = 'outline .3s';
        setTimeout(() => { item.node.style.outline = orig; }, 1500);
      }
    });

    renderItems();
    markCurrent();
  }

  dwt.navigatorModule = {
    mount, collectUserQuestions,
    setKeyword(k) { keyword = k || ''; renderItems(); },
    markCurrent,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); startLiveWatch(); });
  } else {
    mount();
    startLiveWatch();
  }

  // MutationObserver: 监听气泡出现/变化, 实时追加到列表 (不用等 8 秒轮询)
  let liveObserver = null;
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
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const list = collectUserQuestions();
      if (!list.length) {
        const p = document.getElementById(PANEL_ID);
        if (p) p.remove();
        navList = [];
        return;
      }
      navList = list;
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

  console.log('[doubao-web-toolkit] navigator module ready (beautified v2)');
})();
