const FEATURE_DEFS = [
  { id: 'debugPanel', label: '调试面板（开发依赖，必开）' },
  { id: 'batchInput', label: '批量输入 + 验证码暂停（用户原创）' },
  { id: 'export', label: '对话导出（Markdown 单会话 + JSON 全量）' },
  { id: 'navigator', label: '对话导航 pill 条' },
  { id: 'promptBar', label: '提示词快捷条' },
  { id: 'theme', label: '主题切换（深色/浅色）' },
  { id: 'enhance', label: '自动滚动 / 悬浮按钮' },
  { id: 'sourceInspector', label: '联网来源标注' },
];

const $features = document.getElementById('features');
const $msg = document.getElementById('msg');

async function load() {
  const { dwt_features, dwt_batch_json, dwt_batch_lines, dwt_min_interval, dwt_reply_timeout } =
    await chrome.storage.local.get([
      'dwt_features', 'dwt_batch_json', 'dwt_batch_lines', 'dwt_min_interval', 'dwt_reply_timeout'
    ]);

  $features.innerHTML = '';
  FEATURE_DEFS.forEach(f => {
    const div = document.createElement('div');
    div.className = 'feature-item';
    div.innerHTML = `<label><input type="checkbox" data-id="${f.id}" ${dwt_features?.[f.id] ? 'checked' : ''}> ${f.label}</label>`;
    $features.appendChild(div);
  });

  document.getElementById('batch-json').value = dwt_batch_json || '';
  document.getElementById('batch-lines').value = dwt_batch_lines || '';
  document.getElementById('min-interval').value = dwt_min_interval || 3;
  document.getElementById('reply-timeout').value = dwt_reply_timeout || 180;
}

document.getElementById('save').addEventListener('click', async () => {
  const features = {};
  $features.querySelectorAll('input[type=checkbox]').forEach(cb => {
    features[cb.dataset.id] = cb.checked;
  });
  await chrome.storage.local.set({
    dwt_features: features,
    dwt_batch_json: document.getElementById('batch-json').value,
    dwt_batch_lines: document.getElementById('batch-lines').value,
    dwt_min_interval: Number(document.getElementById('min-interval').value),
    dwt_reply_timeout: Number(document.getElementById('reply-timeout').value),
  });
  $msg.textContent = '已保存 ✓';
  setTimeout(() => $msg.textContent = '', 2000);
});

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('#batch-input-config textarea').forEach(x => x.classList.add('hidden'));
    t.classList.add('active');
    document.getElementById('batch-' + t.dataset.tab).classList.remove('hidden');
  });
});

load();
