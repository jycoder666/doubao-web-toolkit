// MV3 Service Worker. Short tasks only.
// 顶部维护：接入开发热重载模块（零依赖），按 dwt_dev_hot_reload 开关决定是否启用。
try { importScripts('hot-reload.js'); } catch (e) { console.warn('[bg]', 'hot-reload 加载失败', e); }
console.log('[bg]', 'service worker ready');

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
