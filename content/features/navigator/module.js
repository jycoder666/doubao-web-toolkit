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
    st.textContent = `
      #dwt-nav {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar { width: 4px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-thumb { background:#d0d7de; border-radius:2px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-track { background:transparent; }
      #dwt-nav .dwt-nav-row {
        display:flex; align-items:center; gap:6px;
        padding:5px 6px; border-radius:6px; cursor:pointer;
        transition: background .12s ease, transform .12s ease;
      }
      #dwt-nav .dwt-nav-row:hover {
        background:#f0f4ff;
        transform: translateX(2px);
      }
      #dwt-nav .dwt-nav-row.dwt-nav-current {
        background:#e8f0ff;
        color:#2d72de;
      }
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
      #dwt-nav.dwt-nav-collapsed .dwt-nav-body,
      #dwt-nav.dwt-nav-collapsed .dwt-nav-footer { display:none !important; }
    `;
    document.head.appendChild(st);
  }

  function renderItems() {
    const box = document.getElementById('dwt-nav-rows');
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
    const footer = document.getElementById('dwt-nav-footer');
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
      // 没消息时清掉旧面板, 避免残留
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
    // 定位右侧 (豆包左侧有约 280px 固定会话栏), top:84px 避开顶栏
    nav.style.cssText = 'position:fixed;right:12px;top:84px;z-index:999998;width:200px;max-height:70vh;'
      + 'display:flex;flex-direction:column;'
      + 'background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);'
      + 'border:1px solid rgba(0,0,0,0.06);border-radius:12px;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);'
      + 'padding:10px;transition:max-height .25s ease, opacity .2s ease;';
    if (collapsed) nav.classList.add('dwt-nav-collapsed');

    nav.innerHTML =
      // 头部: 标题 + 折叠按钮
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
      + '<div style="font-size:13px;font-weight:600;color:#1f2328;letter-spacing:.2px;">� 导航</div>'
      + '<span id="dwt-nav-collapse" title="折叠/展开" style="cursor:pointer;font-size:14px;color:#8b949e;'
      + 'padding:2px 6px;border-radius:4px;transition:background .12s;"'
      + 'onmouseover="this.style.background=\'#f0f2f5\'" onmouseout="this.style.background=\'transparent\'">'
      + (collapsed ? '▶' : '◀') + '</span>'
      + '</div>'
      // 搜索框
      + '<div class="dwt-nav-body">'
      + '<input id="dwt-nav-search" type="text" placeholder="🔍 搜索提问…" '
      + 'style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:6px 10px;border:1px solid #d0d7de;'
      + 'border-radius:8px;font-size:12px;outline:none;transition:border-color .15s, box-shadow .15s;"'
      + 'onfocus="this.style.borderColor=\'#2d72de\';this.style.boxShadow=\'0 0 0 3px rgba(45,114,222,.15)\'"'
      + 'onblur="this.style.borderColor=\'#d0d7de\';this.style.boxShadow=\'none\'">'
      // 条目列表
      + '<div class="dwt-nav-rows" style="overflow-y:auto;flex:1;"></div>'
      // 底部统计
      + '</div>'
      + '<div class="dwt-nav-footer" style="padding-top:6px;margin-top:6px;border-top:1px solid #f0f2f5;'
      + 'font-size:10px;color:#8b949e;text-align:center;"></div>';

    document.body.appendChild(nav);

    // 折叠按钮
    const collapse = nav.querySelector('#dwt-nav-collapse');
    collapse.addEventListener('click', () => {
      collapsed = !collapsed;
      nav.classList.toggle('dwt-nav-collapsed', collapsed);
      collapse.textContent = collapsed ? '▶' : '◀';
    });

    // 搜索
    const search = nav.querySelector('#dwt-nav-search');
    search.value = keyword;
    search.addEventListener('input', (e) => { keyword = e.target.value; renderItems(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());

    // 点击跳转 + 高亮 1.5s
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
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  // 每 8 秒重扫一次 (适配流式输出, 新的用户提问会被发现)
  setInterval(mount, 8000);
  // 滚动时更新"当前"高亮, 500ms 防抖
  let markTimer = null;
  document.addEventListener('scroll', () => {
    if (markTimer) clearTimeout(markTimer);
    markTimer = setTimeout(markCurrent, 500);
  }, true);

  console.log('[doubao-web-toolkit] navigator module ready (beautified v2)');
})();
