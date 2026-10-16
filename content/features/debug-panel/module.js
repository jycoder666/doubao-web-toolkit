// debug-panel/module.js — 调试面板（浮动按钮 + 面板）
//
// 顶部维护说明：
//   面板包含 3 块内容：
//     1) 使用说明（可折叠）—— 讲清每块区域怎么用
//     2) DOM 选择器表 —— 展示 selectorManager.DEFAULTS，可编辑并保存到
//        chrome.storage.local 的 dwt_selectors（覆盖默认值，无需改代码）
//     3) 实时状态 —— 回复生成中 / 验证码 的实时探测结果
//   以及一个「元素选择模式」：进入后鼠标悬停高亮元素，点击目标元素即自动
//   生成其 CSS 选择器，回填到对应输入框并复制到剪贴板；ESC 退出。
//
// 对外事件：window 'dwt-toggle-debug-panel'（popup 通过 content-loader 派发）
(function () {
  'use strict';

  const LOG = '[doubao-web-toolkit]';
  const PANEL_ID = 'dwt-debug-panel';
  const TOGGLE_ID = 'dwt-panel-toggle';

  // 选择器表中可直接编辑保存的键（仅字符串类型；函数/数组类选择器不可文本编辑）
  const EDITABLE_KEYS = ['input', 'aiContent', 'userBubble', 'conversationList'];

  const PANEL_HTML = `
<div id="${PANEL_ID}" style="display:none;position:fixed;bottom:12px;right:12px;width:380px;max-height:80vh;overflow:auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:12px;z-index:999999;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:#1a1a1a;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <b>Doubao Web Toolkit · 调试面板</b>
    <button id="dwt-panel-close" style="border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;">×</button>
  </div>

  <details style="margin-bottom:10px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:6px 8px;">
    <summary style="cursor:pointer;font-weight:600;color:#2d72de;">使用说明（点击展开）</summary>
    <div style="margin-top:6px;line-height:1.7;color:#444;">
      <div><b>1. DOM 选择器表</b>：列出扩展用于定位豆包页面元素的选择器。修改后点该行的「保存」，即写入本地覆盖值（存于 <code>chrome.storage.local.dwt_selectors</code>），无需改代码；点「重置」恢复默认。</div>
      <div><b>2. 元素选择模式</b>：点按钮进入拾取状态，鼠标移动到页面元素会高亮描边，<b>点击目标元素</b>即自动生成其 CSS 选择器，并复制到剪贴板、回填到下方「回填到」下拉选中的那项；按 <b>ESC</b> 或再次点击按钮退出。</div>
      <div><b>3. 实时状态</b>：「回复生成中」= 豆包是否正在流式输出；「验证码」= 是否检测到验证码元素。用于排查批量输入为何暂停。</div>
      <div><b>4. 打开方式</b>：页面右下角「\u2699 DWT」按钮，或在扩展弹窗点「调试面板」。</div>
    </div>
  </details>

  <div style="margin-bottom:8px;">
    <b>DOM 选择器</b>
    <div id="dwt-selector-table" style="margin-top:4px;"></div>
  </div>

  <div style="margin-bottom:8px;">
    <b>实时状态</b>
    <div>回复生成中: <span id="dwt-rs">-</span></div>
    <div>验证码: <span id="dwt-cs">-</span></div>
  </div>

  <div>
    <b>操作</b>
    <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <button id="dwt-pick" style="padding:4px 8px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">元素选择模式</button>
      <label style="font-size:11px;color:#555;">回填到
        <select id="dwt-pick-target" style="font-size:11px;padding:2px 4px;border:1px solid #d0d7de;border-radius:4px;">
          ${EDITABLE_KEYS.map((k) => `<option value="${k}">${k}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="dwt-pick-hint" style="margin-top:6px;font-size:11px;color:#888;"></div>
  </div>
</div>
<button id="${TOGGLE_ID}" style="position:fixed;bottom:12px;right:12px;z-index:999999;padding:6px 10px;background:#2d72de;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;box-shadow:0 2px 8px rgba(45,114,222,.3);">\u2699 DWT</button>`;

  let pickMode = false;         // 是否处于元素拾取状态
  let hoverBox = null;          // 悬停高亮框
  let pickCleanup = null;       // 退出拾取时的清理函数

  // ---------- 选择器表 ----------
  function renderPanel() {
    const table = document.getElementById('dwt-selector-table');
    if (!table) return;
    table.innerHTML = '';
    const sm = window.dwt && window.dwt.selectorManager;
    const defaults = (sm && sm.DEFAULTS) || {};
    const overrides = (sm && sm._overrides) || {};

    EDITABLE_KEYS.forEach((k) => {
      if (typeof defaults[k] !== 'string') return;
      const cur = typeof overrides[k] === 'string' ? overrides[k] : defaults[k];
      const row = document.createElement('div');
      row.style.margin = '4px 0';

      const label = document.createElement('label');
      label.textContent = k;
      label.style.cssText = 'width:104px;display:inline-block;color:#555;vertical-align:top;';
      label.title = '默认: ' + defaults[k];

      const input = document.createElement('input');
      input.value = cur;
      input.dataset.key = k;
      input.style.cssText = 'width:196px;padding:2px 4px;border:1px solid #d0d7de;border-radius:4px;font-family:Consolas,monospace;font-size:11px;';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '保存';
      saveBtn.style.cssText = 'margin-left:4px;padding:2px 6px;border:1px solid #2d72de;color:#2d72de;background:#fff;border-radius:4px;cursor:pointer;font-size:11px;';
      saveBtn.addEventListener('click', () => saveSelector(k, input.value, saveBtn));

      const resetBtn = document.createElement('button');
      resetBtn.textContent = '重置';
      resetBtn.style.cssText = 'margin-left:4px;padding:2px 6px;border:1px solid #d0d7de;color:#666;background:#fff;border-radius:4px;cursor:pointer;font-size:11px;';
      resetBtn.addEventListener('click', () => resetSelector(k, input));

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(saveBtn);
      row.appendChild(resetBtn);
      table.appendChild(row);
    });
  }

  // 保存单个选择器覆盖值到 chrome.storage.local.dwt_selectors
  async function saveSelector(key, value, btn) {
    const sm = window.dwt && window.dwt.selectorManager;
    if (!sm) return;
    const next = Object.assign({}, sm._overrides || {});
    if (value && value.trim()) next[key] = value.trim();
    else delete next[key];
    await sm.save(next);
    flash(btn, '已保存');
    console.log(LOG, '选择器已保存', key, '=', next[key]);
  }

  // 重置单个选择器为默认值
  async function resetSelector(key, input) {
    const sm = window.dwt && window.dwt.selectorManager;
    if (!sm) return;
    const next = Object.assign({}, sm._overrides || {});
    delete next[key];
    await sm.save(next);
    input.value = sm.DEFAULTS[key] || '';
    flash(input, '已重置');
  }

  // 按钮/输入框临时文字反馈
  function flash(el, text) {
    const prev = el.value !== undefined ? el.value : el.textContent;
    if (el.value !== undefined) { el.value = text; setTimeout(() => { el.value = prev; }, 900); }
    else { el.textContent = text; setTimeout(() => { el.textContent = prev; }, 900); }
  }

  // ---------- 实时状态 ----------
  function updateLiveState() {
    const rs = document.getElementById('dwt-rs');
    const cs = document.getElementById('dwt-cs');
    if (rs) rs.textContent = window.dwt?.replyState?.isGenerating() ? '是' : '否';
    if (cs) cs.textContent = window.dwt?.captchaDetector?.isDetected() ? '⚠' : '无';
  }

  // ---------- 元素选择模式 ----------
  // 为元素生成一个尽量稳、尽量短的 CSS 选择器
  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    // 1) id 优先
    if (el.id && !/^\d/.test(el.id) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '#' + CSS.escape(el.id);
    }
    // 2) 豆包常用 data-* 属性（实测稳定）
    for (const attr of ['data-sidebar-item-actions', 'data-streaming', 'data-testid']) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v != null) return el.tagName.toLowerCase() + '[' + attr + '="' + v + '"]';
    }
    // 3) 唯一 class 组合（取前 3 个 class，跳过纯哈希类名如 css-xxx）
    const cls = (el.className && typeof el.className === 'string')
      ? el.className.trim().split(/\s+/).filter((c) => c && !/^(css-|sc-|_)/.test(c)).slice(0, 3)
      : [];
    if (cls.length) {
      const cand = el.tagName.toLowerCase() + '.' + cls.map((c) => CSS.escape(c)).join('.');
      try { if (document.querySelectorAll(cand).length === 1) return cand; } catch (_) {}
    }
    // 4) 向上构建 nth-of-type 路径（最多 5 层）
    const parts = [];
    let node = el;
    for (let i = 0; i < 5 && node && node.nodeType === 1 && node !== document.body; i++) {
      let part = node.tagName.toLowerCase();
      if (node.id && !/^\d/.test(node.id)) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function ensureHoverBox() {
    if (hoverBox) return hoverBox;
    hoverBox = document.createElement('div');
    hoverBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #2d72de;background:rgba(45,114,222,.12);border-radius:2px;display:none;';
    document.body.appendChild(hoverBox);
    return hoverBox;
  }

  function moveHover(e) {
    const box = ensureHoverBox();
    const el = e.target;
    if (!el || el === box || el.id === PANEL_ID || el.id === TOGGLE_ID || (el.closest && el.closest('#' + PANEL_ID))) {
      box.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    setHint('悬停: ' + describeEl(el) + ' ｜ 点击拾取，ESC 退出');
  }

  function describeEl(el) {
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '');
  }

  function setHint(text) {
    const h = document.getElementById('dwt-pick-hint');
    if (h) h.textContent = text || '';
  }

  function onPickClick(e) {
    if (!pickMode) return;
    const el = e.target;
    if (!el || (el.closest && el.closest('#' + PANEL_ID)) || el.id === TOGGLE_ID) return; // 点面板自身不拾取
    e.preventDefault();
    e.stopPropagation();
    const selector = buildSelector(el);
    const target = (document.getElementById('dwt-pick-target') || {}).value || 'input';
    const input = document.querySelector('#dwt-selector-table input[data-key="' + target + '"]');
    if (input) input.value = selector;
    // 复制到剪贴板（失败不阻塞）
    try { navigator.clipboard && navigator.clipboard.writeText(selector); } catch (_) {}
    console.log(LOG, '拾取选择器', selector, '→', target);
    setHint('已拾取: ' + selector + '（已复制，已回填到 ' + target + '，记得点「保存」）');
    exitPickMode();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && pickMode) { exitPickMode(); }
  }

  function enterPickMode() {
    if (pickMode) { exitPickMode(); return; }
    pickMode = true;
    const btn = document.getElementById('dwt-pick');
    if (btn) { btn.style.background = '#2d72de'; btn.style.color = '#fff'; btn.textContent = '选择中…（ESC 退出）'; }
    document.addEventListener('mousemove', moveHover, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    setHint('已进入元素选择模式：移动鼠标高亮，点击元素拾取，ESC 退出');
    pickCleanup = () => {
      document.removeEventListener('mousemove', moveHover, true);
      document.removeEventListener('click', onPickClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }

  function exitPickMode() {
    if (!pickMode) return;
    pickMode = false;
    if (pickCleanup) { pickCleanup(); pickCleanup = null; }
    if (hoverBox) hoverBox.style.display = 'none';
    const btn = document.getElementById('dwt-pick');
    if (btn) { btn.style.background = '#fff'; btn.style.color = '#1a1a1a'; btn.textContent = '元素选择模式'; }
  }

  // ---------- 面板开关 ----------
  function toggle() {
    const p = document.getElementById(PANEL_ID);
    const b = document.getElementById(TOGGLE_ID);
    if (!p) return;
    if (p.style.display === 'none') {
      p.style.display = 'block';
      b.style.display = 'none';
      // 读取最新覆盖值再渲染，保证表格显示当前生效值
      Promise.resolve(window.dwt?.selectorManager?.load?.()).then(renderPanel).catch(renderPanel);
      updateLiveState();
      p._t = setInterval(updateLiveState, 1500);
    } else {
      p.style.display = 'none';
      b.style.display = 'block';
      if (p._t) clearInterval(p._t);
      exitPickMode();
    }
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = PANEL_HTML;
    document.body.appendChild(wrap);
    document.getElementById(TOGGLE_ID).addEventListener('click', toggle);
    document.getElementById('dwt-panel-close').addEventListener('click', toggle);
    document.getElementById('dwt-pick').addEventListener('click', enterPickMode);
    window.addEventListener('dwt-toggle-debug-panel', toggle);
    window.dwt?.captchaDetector?.start?.();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  console.log(LOG, 'debug-panel loaded');
})();
