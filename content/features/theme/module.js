// theme/module.js — 深色/浅色主题切换 (CSS 注入)
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_theme';

  let current = 'light';
  let styleEl = null;

  const DARK_CSS = `
    html, body { background: #0f0f0f !important; }
    [class*="bg-g-"], [class*="bg-"] { background-color: transparent !important; }
    .message-list-zLoNs1, [class*="conversation-message"] { background: #0f0f0f !important; }
    .w-full.pl-16, [class*="pl-16"] { color: #e0e0e0 !important; }
    [class*="text-s-color"] { color: #e0e0e0 !important; }
    [class*="ProseMirror"] { background: #1a1a1a !important; color: #e0e0e0 !important; }
  `;

  async function applyTheme(mode) {
    current = mode;
    if (mode === 'dark') {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dwt-theme-dark';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = DARK_CSS;
    } else {
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
  console.log('[doubao-web-toolkit] theme module ready');
})();
