// source-inspector/module.js — 联网来源标注 (占位)
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  function scanSources() { return []; }
  function mount() {
    console.log('[dwt-source-inspector] placeholder - waiting for doubao source DOM analysis');
  }

  dwt.sourceInspectorModule = { scanSources, mount };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  console.log('[doubao-web-toolkit] source-inspector module ready');
})();
