(function () {
  'use strict';
  const LOG = '[doubao-web-toolkit]';
  console.log(LOG, 'loaded on', location.href);

  chrome.storage.local.get('dwt_features').then((r) => {
    const enabled = r.dwt_features || { debugPanel: true, batchInput: true };
    console.log(LOG, 'features:', enabled);
  }).catch(() => {});

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return true;
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
    return true;
  });
})();
