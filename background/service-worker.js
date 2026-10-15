// MV3 Service Worker. Short tasks only.
const KEYS = {
  FEATURES: 'dwt_features',
  SELECTORS: 'dwt_selectors',
  BATCH_TEMPLATES: 'dwt_batch_templates',
  THEME: 'dwt_theme',
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await chrome.storage.local.get(null);
    if (!existing[KEYS.FEATURES]) {
      await chrome.storage.local.set({ [KEYS.FEATURES]: { debugPanel: true } });
    }
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'GET_KEYS') sendResponse(KEYS);
  return true;
});
