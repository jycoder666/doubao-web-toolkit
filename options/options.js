async function load() {
  const r = await chrome.storage.local.get(['dwt_batch_json','dwt_batch_lines','dwt_min_interval','dwt_reply_timeout']);
  document.getElementById('batch-json').value = r.dwt_batch_json || '';
  document.getElementById('batch-lines').value = r.dwt_batch_lines || '';
  document.getElementById('min-interval').value = r.dwt_min_interval || 3;
  document.getElementById('reply-timeout').value = r.dwt_reply_timeout || 180;
}
document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    dwt_batch_json: document.getElementById('batch-json').value,
    dwt_batch_lines: document.getElementById('batch-lines').value,
    dwt_min_interval: Number(document.getElementById('min-interval').value),
    dwt_reply_timeout: Number(document.getElementById('reply-timeout').value),
  });
  const m = document.getElementById('msg'); m.textContent = '已保存 ✓'; setTimeout(() => m.textContent = '', 2000);
});
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('textarea').forEach(x => x.classList.add('hidden'));
  t.classList.add('active'); document.getElementById('batch-' + t.dataset.tab).classList.remove('hidden');
}));
load();
