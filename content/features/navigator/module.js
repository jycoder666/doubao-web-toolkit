// navigator/module.js — 对话导航: 提取用户问题 → 侧边快速跳转
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';

  function collectUserQuestions() {
    const bubbles = document.querySelectorAll(SEL_USER_BUBBLE);
    const list = [];
    bubbles.forEach((b) => {
      const t = (b.innerText || '').trim();
      if (t) list.push({ text: t.slice(0, 80), node: b });
    });
    return list;
  }

  function mount() {
    const list = collectUserQuestions();
    if (!list.length) return;
    if (document.getElementById('dwt-nav')) { document.getElementById('dwt-nav').remove(); }

    const nav = document.createElement('div');
    nav.id = 'dwt-nav';
    nav.style.cssText = 'position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:999998;width:120px;max-height:60vh;overflow-y:auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:11px;';
    nav.innerHTML = '<b style="display:block;margin-bottom:6px;font-size:12px;">📍 导航</b>' +
      list.map((q, i) =>
        '<div data-idx="' + i + '" style="padding:3px 6px;cursor:pointer;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onmouseover="this.style.background=\'#eef\'" onmouseout="this.style.background=\'transparent\'">' + (i + 1) + '. ' + q.text + '</div>'
      ).join('');
    document.body.appendChild(nav);
    nav.addEventListener('click', (e) => {
      const el = e.target.closest('[data-idx]');
      if (!el) return;
      const idx = Number(el.dataset.idx);
      const item = list[idx];
      if (item && item.node) {
        item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.node.style.outline = '2px solid #2d72de';
        setTimeout(() => { item.node.style.outline = ''; }, 1500);
      }
    });
  }

  dwt.navigatorModule = { mount, collectUserQuestions };

  // 初始挂载 + 定时刷新 (新消息时)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  setInterval(mount, 8000);

  console.log('[doubao-web-toolkit] navigator module ready');
})();
