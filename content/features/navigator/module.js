// navigator/module.js — 对话导航: 提取用户问题 → 侧边快速跳转
// 增强(对应总表 #38 sunqiaozz/Chat-Indexer): 顶部搜索框, 按关键词实时过滤目录项。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';

  let navList = [];       // 当前渲染用的完整列表
  let keyword = '';       // 当前过滤关键词

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

  // 渲染目录项 (按 keyword 过滤)
  function renderItems() {
    const box = document.getElementById('dwt-nav-items');
    if (!box) return;
    const kw = keyword.trim().toLowerCase();
    const rows = [];
    navList.forEach((q, i) => {
      if (kw && !q.text.toLowerCase().includes(kw)) return;
      rows.push('<div data-idx="' + i + '" style="padding:3px 6px;cursor:pointer;border-radius:4px;'
        + 'margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" '
        + 'onmouseover="this.style.background=\'#eef\'" onmouseout="this.style.background=\'transparent\'">'
        + (i + 1) + '. ' + escapeHtml(q.text) + '</div>');
    });
    box.innerHTML = rows.length ? rows.join('') : '<div style="color:#8b949e;padding:4px;">无匹配</div>';
  }

  function mount() {
    const list = collectUserQuestions();
    if (!list.length) return;
    navList = list;
    if (document.getElementById('dwt-nav')) { document.getElementById('dwt-nav').remove(); }
    const nav = document.createElement('div');
    nav.id = 'dwt-nav';
    // 定位在窗口右侧: 豆包左侧有约 280px 固定会话栏, 放左侧会遮挡聊天区, 故移到右侧。
    // 顶部 84px 起, 避开同侧其他扩展 UI(对话摘要面板 top:72px / 提示词条 bottom:64px)。
    nav.style.cssText = 'position:fixed;right:12px;top:84px;z-index:999998;width:150px;max-height:64vh;overflow:hidden;display:flex;flex-direction:column;background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:11px;';
    nav.innerHTML = '<b style="display:block;margin-bottom:6px;font-size:12px;">📍 导航</b>'
      + '<input id="dwt-nav-search" type="text" placeholder="搜索提问…" '
      + 'style="width:100%;box-sizing:border-box;margin-bottom:6px;padding:3px 6px;border:1px solid #d0d7de;'
      + 'border-radius:5px;font-size:11px;outline:none;">'
      + '<div id="dwt-nav-items" style="overflow-y:auto;max-height:56vh;"></div>';
    document.body.appendChild(nav);

    const search = nav.querySelector('#dwt-nav-search');
    search.value = keyword;
    search.addEventListener('input', (e) => { keyword = e.target.value; renderItems(); });
    // 阻止搜索框按键冒泡到页面 (避免触发豆包快捷键)
    search.addEventListener('keydown', (e) => e.stopPropagation());

    nav.addEventListener('click', (e) => {
      const el = e.target.closest('[data-idx]');
      if (!el) return;
      const idx = Number(el.dataset.idx);
      const item = navList[idx];
      if (item && item.node) {
        item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.node.style.outline = '2px solid #2d72de';
        setTimeout(() => { item.node.style.outline = ''; }, 1500);
      }
    });

    renderItems();
  }

  dwt.navigatorModule = { mount, collectUserQuestions, setKeyword(k) { keyword = k || ''; renderItems(); } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  setInterval(mount, 8000);

  console.log('[doubao-web-toolkit] navigator module ready');
})();
