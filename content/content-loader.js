// content-loader.js — 入口脚本
// MV3 content script 不支持 ES Module, 所以 manifest 按依赖顺序列出所有 JS
// 这里只做: 打印 log + 响应 popup 消息 + 功能开关路由
(function () {
  'use strict';

  const LOG = '[doubao-web-toolkit]';
  console.log(LOG, 'loaded on', location.href);

  // 从 storage 读功能开关 (默认都开)
  chrome.storage.local.get('dwt_features').then((r) => {
    const enabled = r.dwt_features || { debugPanel: true, batchInput: true };
    console.log(LOG, 'features:', enabled);
  }).catch(() => {});

  // 响应 popup 的消息
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'TOGGLE_DEBUG_PANEL') {
      window.dispatchEvent(new CustomEvent('dwt-toggle-debug-panel'));
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'START_BATCH') {
      window.dispatchEvent(new CustomEvent('dwt-start-batch', { detail: msg.payload }));
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'STOP_BATCH') {
      window.dispatchEvent(new CustomEvent('dwt-stop-batch'));
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'BATCH_RESUME') {
      // runner.js 内部直接监听 chrome.runtime.onMessage, 这里只需 sendResponse
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'EXPORT_CHAT') {
      window.dispatchEvent(new CustomEvent('dwt-export-chat', { detail: msg.payload }));
      sendResponse({ ok: true });
      return true;
    }
    return true;
  });
})();
