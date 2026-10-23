// MV3 Service Worker. Short tasks only.
// 顶部维护：接入开发热重载模块（零依赖），按 dwt_dev_hot_reload 开关决定是否启用。
// 注意：SW 不持有任何存储键清单或消息协议 —— 存储键的读写方全在页面侧
// （多任务用 dwt_batch_tasks_v1 / dwt_batch_task_q_*，外观键由 theme 模块自理）。
// 在这里留键清单只会变成死代码，误导排查时看错地方（verify 有断言钉住这一点）。
try { importScripts('hot-reload.js'); } catch (e) { console.warn('[bg]', 'hot-reload 加载失败', e); }

const OPTIONS_PATH = 'options/options.html';
const OPTIONS_W = 780;
const OPTIONS_H = 880;

function optionsUrl() {
  try { return chrome.runtime.getURL(OPTIONS_PATH); } catch (_) { return OPTIONS_PATH; }
}

function openOptions() {
  const url = optionsUrl();
  try {
    chrome.windows.getAll({ populate: true, windowTypes: ['popup'] }, (wins) => {
      try {
        const hit = (wins || []).find((w) =>
          (w.tabs || []).some((t) => t.url && t.url.indexOf(OPTIONS_PATH) >= 0)
        );
        if (hit && hit.id != null) {
          chrome.windows.update(hit.id, { focused: true });
          return;
        }
      } catch (_) {}
      chrome.windows.create({
        url: url,
        type: 'popup',
        width: OPTIONS_W,
        height: OPTIONS_H,
      }, () => {
        try {
          if (chrome.runtime.lastError) {
            chrome.runtime.openOptionsPage();
          }
        } catch (_) {
          try { chrome.runtime.openOptionsPage(); } catch (__) {}
        }
      });
    });
  } catch (_) {
    try { chrome.runtime.openOptionsPage(); } catch (__) {}
  }
}

// 右上角扩展图标：无 default_popup → onClicked 只开配置弹窗
try {
  chrome.action.onClicked.addListener(() => { openOptions(); });
} catch (_) {}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'DWT_OPEN_OPTIONS') {
    openOptions();
    try { sendResponse({ ok: true }); } catch (_) {}
    return true;
  }
  return false;
});

console.log('[bg]', 'service worker ready');
