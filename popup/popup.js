// popup.js — 扩展弹窗逻辑
const STATUS = document.getElementById('status');
const BATCH_STATUS = document.getElementById('batch-status');

function setStatus(msg) { STATUS.textContent = msg; setTimeout(() => STATUS.textContent = '', 2000); }
function setBatchStatus(msg) { BATCH_STATUS.textContent = msg; }

async function getActiveDoubaoTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    url: ['https://www.doubao.com/*', 'https://www.dola.com/*'],
  });
  return tabs[0] || null;
}

async function sendToContent(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => { resolve(resp); });
  });
}

// 打开调试面板
document.getElementById('open-debug').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }
  await sendToContent(tab.id, { type: 'TOGGLE_DEBUG_PANEL' });
  setStatus('调试面板指令已发送');
});

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// 批量输入
function parseBatchItems(batchJson, batchLines) {
  if (batchJson && batchJson.trim()) {
    try {
      const arr = JSON.parse(batchJson);
      if (Array.isArray(arr)) return arr.map((x) => (typeof x === 'string' ? { text: x } : x));
    } catch (_) { /* fall through */ }
  }
  if (batchLines && batchLines.trim()) {
    return batchLines.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((t) => ({ text: t }));
  }
  return [];
}

document.getElementById('start-batch').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }

  const stored = await chrome.storage.local.get([
    'dwt_batch_json', 'dwt_batch_lines', 'dwt_min_interval', 'dwt_reply_timeout',
  ]);

  const items = parseBatchItems(stored.dwt_batch_json, stored.dwt_batch_lines);
  if (!items.length) {
    setStatus('配置为空, 请先在选项页填入 JSON 或逐行文本');
    return;
  }

  const payload = {
    items,
    opts: {
      minInterval: stored.dwt_min_interval || 3,
      replyTimeout: stored.dwt_reply_timeout || 180,
    },
  };

  await sendToContent(tab.id, { type: 'START_BATCH', payload });
  setBatchStatus('批量发送中: 0/' + items.length);
  setStatus('批量发送已启动');
});

document.getElementById('stop-batch').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }
  await sendToContent(tab.id, { type: 'STOP_BATCH' });
  setBatchStatus('已停止');
  setStatus('批量发送已停止');
});

document.getElementById('batch-resume').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }
  await sendToContent(tab.id, { type: 'BATCH_RESUME' });
  setBatchStatus('已放行, 继续发送');
  setStatus('已放行, 继续下一条');
});

// 导出
document.getElementById('export-md').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }
  await sendToContent(tab.id, { type: 'EXPORT_CHAT', payload: { format: 'md' } });
  setStatus('已发送导出 Markdown 请求');
});

document.getElementById('export-json').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }
  await sendToContent(tab.id, { type: 'EXPORT_CHAT', payload: { format: 'json' } });
  setStatus('已发送导出 JSON 请求');
});

// ---------- 工具区块: 功能开关 ----------

// 切换某个功能开关 (读写 chrome.storage.local + 通知 content script 立即生效)
// 注意: 不能在 await 之后使用 e.currentTarget (事件派发结束后会被置为 null),
// 因此由调用方把按钮元素与标签先取出来再传入, 保证异步流程中引用始终有效。
async function toggleFeature(btn, key, defaultOn) {
  const r = await chrome.storage.local.get(key);
  const cur = r[key] === undefined ? defaultOn : r[key] === true;
  const next = !cur;
  await chrome.storage.local.set({ [key]: next });
  const tab = await getActiveDoubaoTab();
  if (tab) await sendToContent(tab.id, { type: 'TOGGLE_FEATURE', payload: { key, value: next } });
  btn.classList.toggle('on', next);
  setStatus((next ? '已开启: ' : '已关闭: ') + btn.dataset.label);
}

document.getElementById('toggle-source').dataset.label = '来源标注';
document.getElementById('toggle-source').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  toggleFeature(btn, 'dwt_source_inspector', true);
});

document.getElementById('toggle-conv').dataset.label = '对话管理';
document.getElementById('toggle-conv').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  toggleFeature(btn, 'dwt_conv_manager', false);
});

document.getElementById('toggle-readmark').dataset.label = '阅读标记';
document.getElementById('toggle-readmark').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  toggleFeature(btn, 'dwt_reading_mark', true);
});

document.getElementById('toggle-digest').dataset.label = '对话摘要';
document.getElementById('toggle-digest').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  toggleFeature(btn, 'dwt_chat_digest', false);
});

// 立即扫描来源
document.getElementById('scan-source').addEventListener('click', async () => {
  const tab = await getActiveDoubaoTab();
  if (!tab) { setStatus('请先打开 doubao.com 页面'); return; }
  await sendToContent(tab.id, { type: 'SCAN_SOURCE' });
  setStatus('已触发来源扫描');
});

// 初始化按钮的开关态
(async function initToolButtons() {
  const r = await chrome.storage.local.get([
    'dwt_source_inspector', 'dwt_conv_manager', 'dwt_reading_mark', 'dwt_chat_digest',
  ]);
  document.getElementById('toggle-source')
    .classList.toggle('on', r.dwt_source_inspector !== false);
  document.getElementById('toggle-conv')
    .classList.toggle('on', r.dwt_conv_manager === true);
  document.getElementById('toggle-readmark')
    .classList.toggle('on', r.dwt_reading_mark !== false);
  document.getElementById('toggle-digest')
    .classList.toggle('on', r.dwt_chat_digest === true);
})();

// 监听 content script 反馈
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'BATCH_EVENT') {
    setBatchStatus(msg.state + ': ' + (msg.index + 1) + '/' + msg.total);
  }
  if (msg?.type === 'BATCH_CAPTCHA_DETECTED') {
    setBatchStatus('⚠ 检测到验证码, 已暂停, 处理完点"继续下一条"');
  }
});
