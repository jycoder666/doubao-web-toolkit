// popup.js — 扩展图标只负责打开配置页（工具开关已迁 options）
(function () {
  'use strict';
  function openCfg() {
    try {
      chrome.runtime.openOptionsPage();
    } catch (_) {}
    try { window.close(); } catch (_) {}
  }
  const btn = document.getElementById('open-options');
  if (btn) btn.addEventListener('click', openCfg);
  openCfg();
})();
