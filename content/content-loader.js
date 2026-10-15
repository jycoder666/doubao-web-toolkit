// Entry injector for doubao.com / dola.com
// Dynamic import — zero build, ES Module.

const LOG = '[doubao-web-toolkit]';

const FEATURE_MODULES = {
  'debug-panel':   () => import('./features/debug-panel/module.js'),
  'batch-input':   () => import('./features/batch-input/module.js'),
  'export':        () => import('./features/export/module.js'),
  'navigator':     () => import('./features/navigator/module.js'),
  'prompt-bar':    () => import('./features/prompt-bar/module.js'),
  'theme':         () => import('./features/theme/module.js'),
  'enhance':       () => import('./features/enhance/module.js'),
  'source-inspector': () => import('./features/source-inspector/module.js'),
};

async function loadActiveFeatures() {
  const { dwt_features } = await chrome.storage.local.get('dwt_features');
  const enabled = dwt_features || { debugPanel: true };

  // 映射 feature toggle id → module 名
  const toggleMap = {
    debugPanel: 'debug-panel',
    batchInput: 'batch-input',
    export: 'export',
    navigator: 'navigator',
    promptBar: 'prompt-bar',
    theme: 'theme',
    enhance: 'enhance',
    sourceInspector: 'source-inspector',
  };

  for (const [toggleId, modName] of Object.entries(toggleMap)) {
    if (enabled[toggleId] && FEATURE_MODULES[modName]) {
      try {
        const mod = await FEATURE_MODULES[modName]();
        mod.default?.init?.();
        console.log(LOG, 'feature loaded:', modName);
      } catch (e) {
        console.warn(LOG, 'feature load failed:', modName, e);
      }
    }
  }
}

// 响应 popup "TOGGLE_DEBUG_PANEL" 消息
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'TOGGLE_DEBUG_PANEL') {
    window.dispatchEvent(new CustomEvent('dwt-toggle-debug-panel'));
    sendResponse({ ok: true });
  }
  if (msg?.type === 'START_BATCH') {
    // 批量输入启动逻辑在 batch-input module 里监听此事件
    window.dispatchEvent(new CustomEvent('dwt-start-batch', { detail: msg.payload }));
    sendResponse({ ok: true });
  }
  if (msg?.type === 'BATCH_RESUME') {
    window.dispatchEvent(new CustomEvent('dwt-resume-batch'));
    sendResponse({ ok: true });
  }
  return true;
});

console.log(LOG, 'loaded on', location.href);
loadActiveFeatures();
