// source-inspector/module.js — 联网来源标注
// 豆包回复中如果引用了网页来源, 标注出来 (待观察 DOM 结构后实现)
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  function scanSources() {
    // 预留: 扫描 AI 回复中的引用来源 (如 [1] [2] 或内联链接)
    // 当前豆包网页版回复的联网来源 DOM 结构尚未确认
    return [];
  }

  function mount() {
    // 占位, 等豆包回复 DOM 确认来源结构后实现
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
