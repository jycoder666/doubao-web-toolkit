// MV3 Service Worker. Short tasks only — max ~30s lifetime.
// Storage key registry + initial install defaults + message routing.
// NOTE: Service Worker does NOT support ES Module export/import.

const KEYS = {
  FEATURES: 'dwt_features',          // { debugPanel: true, batchInput: true, ... }
  SELECTORS: 'dwt_selectors',        // { input, send, replyState, captcha }
  BATCH_TEMPLATES: 'dwt_batch_templates',
  THEME: 'dwt_theme',
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await chrome.storage.local.get(null);
    if (!existing[KEYS.FEATURES]) {
      await chrome.storage.local.set({
        [KEYS.FEATURES]: { debugPanel: true },
      });
    }
  } catch (_) { /* storage may not be ready */ }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'GET_KEYS') sendResponse(KEYS);
  return true;
});
