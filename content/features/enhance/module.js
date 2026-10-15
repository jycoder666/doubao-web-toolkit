// enhance/module.js — 自动滚动到最新回复 + 悬浮快捷按钮
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  function scrollToBottom(smooth) {
    const c = document.querySelector('[class*="message-list"]');
    const target = c || document.documentElement;
    target.scrollTo({ top: target.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function mount() {
    if (document.getElementById('dwt-enhance-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'dwt-enhance-btn';
    btn.textContent = '⬇';
    btn.title = '滚动到底部';
    btn.style.cssText = 'position:fixed;bottom:56px;left:12px;z-index:999998;width:32px;height:32px;border-radius:50%;border:1px solid #d0d7de;background:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:14px;line-height:1;';
    btn.onclick = () => scrollToBottom(true);
    document.body.appendChild(btn);
  }

  // 自动滚动: 监听 DOM 变化 (新回复时自动滚)
  let autoEnabled = true;
  let lastHeight = 0;

  function observeChanges() {
    const c = document.querySelector('[class*="message-list"]');
    if (!c) return;
    const obs = new MutationObserver(() => {
      if (!autoEnabled) return;
      const h = c.scrollHeight;
      if (h !== lastHeight) {
        lastHeight = h;
        // 只在用户已经接近底部时自动滚
        if (c.scrollHeight - c.scrollTop - c.clientHeight < 200) {
          c.scrollTop = c.scrollHeight;
        }
      }
    });
    obs.observe(c, { childList: true, subtree: true, characterData: true });
  }

  dwt.enhanceModule = { mount, scrollToBottom, observeChanges, setAuto: (v) => autoEnabled = v };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); observeChanges(); });
  } else {
    mount(); observeChanges();
  }

  console.log('[doubao-web-toolkit] enhance module ready');
})();
