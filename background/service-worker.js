// MV3 Service Worker. Short tasks only — max ~30s lifetime.
// Feature toggles / storage key registry / message routing.

const KEYS = {
  FEATURES: 'dwt_features',          // { debugPanel: true, batchInput: true, ... }
  SELECTORS: 'dwt_selectors',        // { input: '...', send: '...', replyState: '...', captcha: '...' }
  BATCH_TEMPLATES: 'dwt_batch_templates',
  THEME: 'dwt_theme',                // 'light' | 'dark' | 'auto'
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  if (!existing[KEYS.FEATURES]) {
    await chrome.storage.local.set({
      [KEYS.FEATURES]: { debugPanel: true },
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GET_KEYS') sendResponse(KEYS);
  return true;
});
