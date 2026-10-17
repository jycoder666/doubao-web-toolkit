// theme/module.js — 深色/浅色主题切换 (CSS 注入)
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_theme';

  let current = 'light';
  let styleEl = null;

  const DARK_CSS = `
    html, body { background: #0f0f0f !important; }
    /* 排除划词高亮 mark，避免暗色「清背景」把高亮底色刷透明 */
    [class*="bg-g-"]:not([data-dwt-hl]), [class*="bg-"]:not([data-dwt-hl]) { background-color: transparent !important; }
    .message-list-zLoNs1, [class*="conversation-message"] { background: #0f0f0f !important; }
    .w-full.pl-16:not([data-dwt-hl]), [class*="pl-16"]:not([data-dwt-hl]) { color: #e0e0e0 !important; }
    [class*="text-s-color"]:not([data-dwt-hl]) { color: #e0e0e0 !important; }
    /* 高亮内部常有 text-s-color / pl-16 子节点，必须再压回深色字，否则黄底+浅字不可读 */
    mark[data-dwt-hl], mark[data-dwt-hl] *, mark.dwt-hl, mark.dwt-hl * {
      color: #1f2328 !important;
      -webkit-text-fill-color: #1f2328 !important;
    }
    [class*="ProseMirror"] { background: #1a1a1a !important; color: #e0e0e0 !important; }
  `;

  async function applyTheme(mode) {
    current = mode;
    if (mode === 'dark') {
      // 热重载时复用已有节点，避免重复 #dwt-theme-dark，并写入最新 DARK_CSS
      styleEl = document.getElementById('dwt-theme-dark') || styleEl;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dwt-theme-dark';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = DARK_CSS;
    } else {
      styleEl = document.getElementById('dwt-theme-dark') || styleEl;
      if (styleEl) { styleEl.remove(); styleEl = null; }
    }
    try { await chrome.storage.local.set({ [KEY]: mode }); } catch (_) {}
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(KEY);
      await applyTheme(r[KEY] || 'light');
    } catch (_) { applyTheme('light'); }
  }

  dwt.themeModule = {
    toggle() { applyTheme(current === 'dark' ? 'light' : 'dark'); return current; },
    apply: applyTheme,
    getCurrent: () => current,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] theme module ready');
})();
