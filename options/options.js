// options.js — 配置页逻辑: 功能开关 + 批量输入模板 + 全局设置
const FEATURE_KEYS = {
  'feat-source': 'dwt_source_inspector', // 联网来源标注 (默认开)
  'feat-input': 'dwt_enter_swap',        // 输入增强 (默认开)
  'feat-conv': 'dwt_conv_manager',       // 对话管理 (默认关)
  'feat-readmark': 'dwt_reading_mark',   // 阅读位置标记 (默认开)
  'feat-digest': 'dwt_chat_digest',      // 对话摘要 (默认关)
  'feat-selection': 'dwt_selection_tools', // 划词语料/高亮/LaTeX (默认开)
  'feat-rec': 'dwt_rec_blocker',         // 首页推荐屏蔽 (默认开)
  'feat-vibe': 'dwt_vibe',               // 背景氛围 (默认关)
  'feat-float': 'dwt_float_panel',       // 悬浮便签 (默认关)
  'feat-comfort': 'dwt_page_comfort',    // 宽屏/长回复折叠 (默认关)
  'feat-spark': 'dwt_keyword_spark',     // 视觉关键词 (默认关)
  'feat-context': 'dwt_context_lines',   // 英语拆行解释 (默认关)
  'feat-arxiv': 'dwt_arxiv_prompt',      // arXiv 解读提示 (默认关)
  'feat-debug': 'dwt_debug_panel',       // 调试面板 (默认开)
};

// 默认关闭的功能 (其余默认开启)
const DEFAULT_OFF = ['dwt_conv_manager', 'dwt_chat_digest', 'dwt_vibe', 'dwt_float_panel', 'dwt_page_comfort', 'dwt_keyword_spark', 'dwt_context_lines', 'dwt_arxiv_prompt'];

async function load() {
  // 批量输入 + 全局设置
  const r = await chrome.storage.local.get([
    'dwt_batch_json', 'dwt_batch_lines', 'dwt_min_interval', 'dwt_reply_timeout',
    'dwt_dev_hot_reload',
    ...Object.values(FEATURE_KEYS),
  ]);
  document.getElementById('batch-json').value = r.dwt_batch_json || '';
  document.getElementById('batch-lines').value = r.dwt_batch_lines || '';
  document.getElementById('min-interval').value = r.dwt_min_interval || 3;
  document.getElementById('reply-timeout').value = r.dwt_reply_timeout || 180;
  // 开发热重载: 默认关闭
  document.getElementById('dev-hot-reload').checked = r.dwt_dev_hot_reload === true;

  // 功能开关: 未设置时用默认值 (DEFAULT_OFF 中的默认关, 其余默认开)
  Object.entries(FEATURE_KEYS).forEach(([id, key]) => {
    const def = !DEFAULT_OFF.includes(key);
    document.getElementById(id).checked = r[key] === undefined ? def : r[key] === true;
  });
}

document.getElementById('save').addEventListener('click', async () => {
  const payload = {
    dwt_batch_json: document.getElementById('batch-json').value,
    dwt_batch_lines: document.getElementById('batch-lines').value,
    dwt_min_interval: Number(document.getElementById('min-interval').value),
    dwt_reply_timeout: Number(document.getElementById('reply-timeout').value),
    dwt_dev_hot_reload: document.getElementById('dev-hot-reload').checked,
  };
  Object.entries(FEATURE_KEYS).forEach(([id, key]) => {
    payload[key] = document.getElementById(id).checked;
  });
  await chrome.storage.local.set(payload);
  const m = document.getElementById('msg');
  m.textContent = '已保存 ✓ 刷新豆包页面后生效';
  setTimeout(() => m.textContent = '', 2500);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('textarea').forEach(x => x.classList.add('hidden'));
  t.classList.add('active');
  document.getElementById('batch-' + t.dataset.tab).classList.remove('hidden');
}));

load();
