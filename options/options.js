// options.js — 配置页逻辑: 功能开关 + 批量问答间隔/超时 + 选择器覆盖编辑器
const FEATURE_KEYS = {
  'feat-source': 'dwt_source_inspector', // 联网来源标注 (默认开)
  'feat-input': 'dwt_enter_swap',        // 输入增强 (默认开)
  'feat-conv': 'dwt_conv_manager',       // 对话管理 (默认关)
  'feat-readmark': 'dwt_reading_mark',   // 阅读位置标记 (默认开)
  'feat-digest': 'dwt_chat_digest',      // 对话摘要 (默认关)
  'feat-outline': 'dwt_outline',         // 回复大纲 (默认开)
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

function storageLocal() {
  try {
    return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
  } catch (_) {
    return null;
  }
}

function onLocalServe() {
  try {
    return location.hostname === '127.0.0.1' && (location.port === '5179' || location.port === '');
  } catch (_) {
    return false;
  }
}

// Glass 直开配置页时：若尚未注入 chrome-mock，动态拉起 storage 桥（与 serve 注入双保险）
let _mockPromise = null;
function ensureStorage() {
  if (storageLocal()) return Promise.resolve(storageLocal());
  if (!onLocalServe()) return Promise.resolve(null);
  if (_mockPromise) return _mockPromise;
  _mockPromise = new Promise((resolve) => {
    const done = () => resolve(storageLocal());
    if (window.__dwtChromeMock) { done(); return; }
    const s = document.createElement('script');
    s.src = '/dev/chrome-mock.js?t=' + Date.now();
    s.onload = () => done();
    s.onerror = () => done();
    (document.head || document.documentElement).appendChild(s);
  });
  return _mockPromise;
}

function applyFeatureDefaults(r) {
  const data = r || {};
  document.getElementById('min-interval').value = data.dwt_min_interval || 3;
  document.getElementById('reply-timeout').value = data.dwt_reply_timeout || 180;
  document.getElementById('dev-hot-reload').checked = data.dwt_dev_hot_reload === true;
  Object.entries(FEATURE_KEYS).forEach(([id, key]) => {
    const def = !DEFAULT_OFF.includes(key);
    const el = document.getElementById(id);
    if (el) el.checked = data[key] === undefined ? def : data[key] === true;
  });
}

async function load() {
  // 全局设置（批量模板编辑已移除，历史数据由批量面板自身的迁移链兜底读取）
  const sl = await ensureStorage();
  if (!sl) {
    applyFeatureDefaults({});
    if (onLocalServe()) msg('storage 桥未就绪，请确认 5179 serve 已启动', 3500);
    return;
  }
  try {
    const r = await sl.get([
      'dwt_min_interval', 'dwt_reply_timeout',
      'dwt_dev_hot_reload',
      ...Object.values(FEATURE_KEYS),
    ]);
    applyFeatureDefaults(r);
  } catch (_) {
    applyFeatureDefaults({});
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const payload = {
    dwt_min_interval: Number(document.getElementById('min-interval').value),
    dwt_reply_timeout: Number(document.getElementById('reply-timeout').value),
    dwt_dev_hot_reload: document.getElementById('dev-hot-reload').checked,
  };
  Object.entries(FEATURE_KEYS).forEach(([id, key]) => {
    payload[key] = document.getElementById(id).checked;
  });
  const sl = await ensureStorage();
  if (!sl) {
    msg(onLocalServe()
      ? 'storage 桥未就绪：请确认本机 5179 serve 在跑，然后刷新本页'
      : '当前页无 storage，请用扩展图标打开配置页', 4000);
    return;
  }
  try {
    await sl.set(payload);
    const viaBridge = !!window.__dwtChromeMock;
    msg(viaBridge
      ? '已保存 ✓（内置预览 storage 桥）· 已打开的豆包页会同步'
      : '已保存 ✓ 刷新豆包页面后生效', 2800);
  } catch (e) {
    msg('保存失败：' + ((e && e.message) || e));
  }
});

// ---------------------------------------------------------------- DOM 选择器覆盖编辑器（FR-11）
// 单一事实源 = content/core/selector-manager.js 的 DEFAULTS（本文件开头引入，先于本脚本执行，
// 挂在 window.dwt 上）。可编辑键运行时派生：string/array 值进输入框，function 值（发送按钮
// 特征匹配等）只渲染只读说明行 —— selector-manager 新增键时 UI 自动跟上，永不漂移。
// 存储语义：单键 dwt_selectors 整包读写；保存前必先 get 现网覆盖值 → 合并本次改动 →
// 空值 delete 回落默认 → set 整包回存（禁整份覆盖写回，禁把默认值写进覆盖值）。
function getDefaults() {
  return (window.dwt && window.dwt.selectorManager && window.dwt.selectorManager.DEFAULTS) || {};
}
const DEFAULTS = getDefaults();

function msg(text, ms) {
  const m = document.getElementById('msg');
  m.textContent = text || '';
  if (text) setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, ms || 4000);
}

// 数组语义键（默认值为 array）按逗号/换行切分 + 过滤空段（与调试面板同款）；字符串键 trim 原样
function parseValue(isList, raw) {
  if (isList) {
    return String(raw == null ? '' : raw).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  }
  return String(raw == null ? '' : raw).trim();
}

function readSelOverrides() {
  return ensureStorage().then((sl) => {
    if (!sl) return {};
    return sl.get('dwt_selectors').then((r) => {
      const ov = r && r.dwt_selectors;
      return (ov && typeof ov === 'object' && !Array.isArray(ov)) ? ov : {};
    }).catch(() => ({}));
  });
}

// 语法校验：离屏元素的 matches() 会先走 CSS 解析，非法选择器抛 SyntaxError，零副作用
const SEL_PROBE = document.createElement('div');
function selectorSyntaxError(sel) {
  try {
    SEL_PROBE.matches(sel);
    return null;
  } catch (e) {
    return (e && e.message) || '非法选择器';
  }
}

// 校验单行输入：返回 { ok } / { empty } / { error }，value 恒为 parseValue 后的落盘形态
function validateSelInput(isList, raw) {
  const value = parseValue(isList, raw);
  if (isList) {
    if (!value.length) return { empty: true, value: value };
    for (let i = 0; i < value.length; i++) {
      const err = selectorSyntaxError(value[i]);
      if (err) return { error: '第 ' + (i + 1) + ' 项非法: ' + err, value: value };
    }
    return { ok: true, value: value };
  }
  if (!value) return { empty: true, value: value };
  const err = selectorSyntaxError(value);
  return err ? { error: err, value: value } : { ok: true, value: value };
}

function buildSelRow(key, ov, refresh) {
  const def = getDefaults()[key];
  const isList = Array.isArray(def);
  const overridden = ov[key] !== undefined;
  const defaultText = isList ? def.join(', ') : String(def == null ? '' : def);

  const row = document.createElement('div');
  row.className = 'sel-row';

  const head = document.createElement('div');
  head.className = 'sel-row-head';
  const name = document.createElement('span');
  name.className = 'sel-key';
  name.textContent = key + (isList ? '（多个，逗号分隔）' : '');
  name.title = '默认值: ' + defaultText;
  const badge = document.createElement('span');
  badge.className = 'sel-badge ' + (overridden ? 'sel-badge-ov' : 'sel-badge-def');
  badge.textContent = overridden ? '已覆盖' : '默认';
  head.appendChild(name);
  head.appendChild(badge);
  row.appendChild(head);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sel-input';
  input.id = 'sel-input-' + key;
  input.placeholder = defaultText || '（默认为空）';
  input.value = overridden
    ? (isList && Array.isArray(ov[key]) ? ov[key].join(', ') : String(ov[key]))
    : defaultText;
  row.appendChild(input);

  const status = document.createElement('span');
  status.className = 'sel-status';
  row.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'sel-actions';

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'sel-btn';
  checkBtn.textContent = '校验';
  checkBtn.addEventListener('click', () => {
    const res = validateSelInput(isList, input.value);
    if (res.empty) {
      status.textContent = '空：保存将回落默认值';
      status.className = 'sel-status';
    } else if (res.error) {
      status.textContent = '非法：' + res.error;
      status.className = 'sel-status sel-status-bad';
    } else {
      status.textContent = '语法 OK';
      status.className = 'sel-status sel-status-ok';
    }
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'sel-btn';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', async () => {
    const res = validateSelInput(isList, input.value);
    if (res.error) {
      msg('保存被拒绝——' + res.error);
      return;
    }
    const sl = await ensureStorage();
    if (!sl) { msg('当前页无 storage，无法保存选择器'); return; }
    const next = await readSelOverrides(); // 先读现网，只合并本次改动的键
    if (res.empty) delete next[key]; // 空值 = 回落默认，不写覆盖
    else next[key] = res.value;
    await sl.set({ dwt_selectors: next });
    refresh();
    msg(res.empty ? '已回落默认值，刷新豆包页面后生效' : '已保存，刷新豆包页面后生效');
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'sel-btn';
  resetBtn.textContent = '重置';
  resetBtn.addEventListener('click', async () => {
    const sl = await ensureStorage();
    if (!sl) { msg('当前页无 storage，无法重置'); return; }
    const next = await readSelOverrides();
    delete next[key]; // 从覆盖值删键回落默认，禁止把默认值写进覆盖值
    await sl.set({ dwt_selectors: next });
    refresh();
    msg('已重置为默认，刷新豆包页面后生效');
  });

  actions.appendChild(checkBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(resetBtn);
  row.appendChild(actions);
  return row;
}

async function refreshSelJson() {
  const ov = await readSelOverrides();
  const ta = document.getElementById('sel-json');
  if (ta) ta.value = JSON.stringify(ov, null, 2);
  return ov;
}

async function renderSelEditor() {
  const host = document.getElementById('sel-editor');
  if (!host) return;
  let ov = {};
  try { ov = await readSelOverrides(); } catch (_) { ov = {}; }
  while (host.firstChild) host.removeChild(host.firstChild);

  // 键清单运行时派生：string/array 值 → 可编辑行；function 值 → 只读说明行
  const defaults = getDefaults();
  const editableKeys = [];
  const fnKeys = [];
  Object.keys(defaults).forEach((k) => {
    const def = defaults[k];
    if (typeof def === 'function') fnKeys.push(k);
    else editableKeys.push(k);
  });

  editableKeys.forEach((key) => {
    host.appendChild(buildSelRow(key, ov, () => {
      renderSelEditor();
    }));
  });

  fnKeys.forEach((k) => {
    const note = document.createElement('div');
    note.className = 'sel-row sel-row-fn';
    const name = document.createElement('span');
    name.className = 'sel-key';
    name.textContent = k;
    const desc = document.createElement('span');
    desc.className = 'muted';
    desc.textContent = '函数型匹配（内置实现，不可在此编辑）';
    note.appendChild(name);
    note.appendChild(desc);
    host.appendChild(note);
  });

  await refreshSelJson();
}

// JSON 高级区导入：合法 JSON 才整包落盘；未知键显式拒绝，绝不写进存储
async function applyJson() {
  const ta = document.getElementById('sel-json');
  let parsed;
  try {
    parsed = JSON.parse(ta.value);
  } catch (e) {
    msg('JSON 格式错误：' + e.message); return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    msg('JSON 格式错误：需要 { 键: 选择器 } 形式的对象'); return;
  }
  const defaults = getDefaults();
  const allow = Object.keys(defaults);
  try {
    Object.keys(parsed).forEach((k) => {
      if (allow.indexOf(k) < 0) throw new Error('未知键: ' + k);
    });
  } catch (e) {
    msg(e.message); return;
  }
  const sl = await ensureStorage();
  if (!sl) { msg('当前页无 storage，无法导入'); return; }
  const next = await readSelOverrides();
  Object.keys(parsed).forEach((k) => {
    const raw = Array.isArray(parsed[k]) ? parsed[k].join(', ') : parsed[k];
    const value = parseValue(Array.isArray(defaults[k]), raw);
    if (!value || (Array.isArray(value) && !value.length)) delete next[k];
    else next[k] = value;
  });
  await sl.set({ dwt_selectors: next });
  await renderSelEditor();
  msg('已导入 ' + Object.keys(parsed).length + ' 个键，刷新豆包页面后生效');
}

// 全部重置：禁 alert/confirm（项目惯例），用内联二次点击确认，3s 不点自动撤防
let selResetArmed = false;
let selResetTimer = 0;
function resetAllSelectors() {
  const btn = document.getElementById('sel-reset-all');
  if (!selResetArmed) {
    selResetArmed = true;
    btn.textContent = '再点一次确认清空全部覆盖';
    btn.classList.add('sel-danger-armed');
    clearTimeout(selResetTimer);
    selResetTimer = setTimeout(() => {
      selResetArmed = false;
      btn.textContent = '全部重置';
      btn.classList.remove('sel-danger-armed');
    }, 3000);
    return;
  }
  selResetArmed = false;
  clearTimeout(selResetTimer);
  btn.textContent = '全部重置';
  btn.classList.remove('sel-danger-armed');
  ensureStorage().then((sl) => {
    if (!sl) { msg('当前页无 storage，无法清空'); return; }
    sl.set({ dwt_selectors: {} }).then(() => {
      renderSelEditor();
      msg('已清空全部选择器覆盖，全部回落默认，刷新豆包页面后生效');
    });
  });
}

const selApplyBtn = document.getElementById('sel-json-apply');
if (selApplyBtn) selApplyBtn.addEventListener('click', () => { applyJson(); });
const selResetAllBtn = document.getElementById('sel-reset-all');
if (selResetAllBtn) selResetAllBtn.addEventListener('click', () => { resetAllSelectors(); });

// 在已打开的豆包标签页打开调试面板（不新开豆包页）
const openDebugBtn = document.getElementById('open-debug');
if (openDebugBtn) {
  openDebugBtn.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({
        url: ['https://www.doubao.com/*', 'https://www.dola.com/*'],
      });
      if (!tabs || !tabs.length) {
        msg('未找到已打开的豆包标签页，请先打开豆包再试');
        return;
      }
      let ok = 0;
      await Promise.all(tabs.map((t) => new Promise((resolve) => {
        try {
          chrome.tabs.sendMessage(t.id, { type: 'TOGGLE_DEBUG_PANEL' }, () => {
            try { if (!chrome.runtime.lastError) ok += 1; } catch (_) {}
            resolve();
          });
        } catch (_) { resolve(); }
      })));
      msg(ok ? '已在豆包页切换调试面板' : '豆包页未响应，请刷新页面后重试');
    } catch (e) {
      msg('打开失败：' + ((e && e.message) || e));
    }
  });
}

// ---------- 分区折叠 + 分区导航 ----------
const FOLD_KEY = 'dwt_options_fold_v2';
const sectionEls = () => Array.from(document.querySelectorAll('details.card[data-toc]'));

function buildToc() {
  const nav = document.getElementById('toc-nav');
  if (!nav) return;
  while (nav.firstChild) nav.removeChild(nav.firstChild);
  sectionEls().forEach((sec) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toc-link';
    btn.dataset.target = sec.id;
    btn.textContent = sec.getAttribute('data-toc') || sec.id;
    btn.addEventListener('click', () => {
      sec.open = true;
      persistFold();
      const sc = document.getElementById('main-scroll');
      if (sc) {
        const top = sec.offsetTop - sc.offsetTop;
        sc.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
      } else {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setActiveToc(sec.id);
    });
    nav.appendChild(btn);
  });
}

function setActiveToc(id) {
  document.querySelectorAll('.toc-link').forEach((el) => {
    el.classList.toggle('active', el.dataset.target === id);
  });
}

function persistFold() {
  const map = {};
  sectionEls().forEach((sec) => { map[sec.id] = !!sec.open; });
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(map)); } catch (_) {}
}

function restoreFold() {
  let map = null;
  try { map = JSON.parse(localStorage.getItem(FOLD_KEY) || 'null'); } catch (_) { map = null; }
  // 无记忆时默认全部折叠，只留标题条；点标题或分区导航再展开内容
  if (!map || typeof map !== 'object') {
    sectionEls().forEach((sec) => { sec.open = false; });
    return;
  }
  sectionEls().forEach((sec) => {
    if (Object.prototype.hasOwnProperty.call(map, sec.id)) sec.open = !!map[sec.id];
    else sec.open = false;
  });
}

function setAllFold(open) {
  sectionEls().forEach((sec) => { sec.open = !!open; });
  persistFold();
}

buildToc();
restoreFold();
sectionEls().forEach((sec) => {
  sec.addEventListener('toggle', () => {
    persistFold();
    if (sec.open) setActiveToc(sec.id);
  });
});

const foldAllBtn = document.getElementById('fold-all');
const expandAllBtn = document.getElementById('expand-all');
if (foldAllBtn) foldAllBtn.addEventListener('click', () => setAllFold(false));
if (expandAllBtn) expandAllBtn.addEventListener('click', () => setAllFold(true));

// 分区内容区滚动时高亮当前分区（标题栏不跟着滚）
let tocRaf = 0;
const mainScroll = document.getElementById('main-scroll');
function onMainScroll() {
  if (tocRaf) return;
  tocRaf = requestAnimationFrame(() => {
    tocRaf = 0;
    const sc = document.getElementById('main-scroll');
    if (!sc) return;
    const secs = sectionEls();
    let cur = secs[0] && secs[0].id;
    const y = sc.scrollTop + 24;
    secs.forEach((sec) => {
      if (sec.offsetTop - sc.offsetTop <= y) cur = sec.id;
    });
    if (cur) setActiveToc(cur);
  });
}
if (mainScroll) mainScroll.addEventListener('scroll', onMainScroll, { passive: true });

const secSel = document.getElementById('sec-sel');
if (secSel) {
  secSel.addEventListener('toggle', () => {
    if (!secSel.open) return;
    const host = document.getElementById('sel-editor');
    if (host && host.children.length === 0) renderSelEditor();
  });
}

load();
renderSelEditor().catch(() => { try { renderSelEditor(); } catch (_) {} });
