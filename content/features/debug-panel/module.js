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

  // ⓘ 挂面板标题（rail 旁注不再挂，避免菜单滑动再弹一层）
  const HELP = {
    title: '⚙ 调试面板',
    desc: '排障用：改 DOM 选择器，看生成中 / 验证码状态。',
    rows: [
      ['打开', '工具栏 ⚙ 或 popup 打开'],
      ['选择器表', '改完保存到本机，覆盖默认值'],
      ['元素选择', '进入后点页面元素 → 生成选择器并回填；Esc 退出'],
      ['实时状态', '当场探测「生成中 / 验证码」'],
    ],
    note: '只存本机；豆包改版后用元素选择取新选择器。',
  };

  const LOG = '[cs][doubao-web-toolkit]';
  const PANEL_ID = 'dwt-debug-panel';
  const TOGGLE_ID = 'dwt-panel-toggle';

  // 选择器表中可编辑的键：
  //   STR_KEYS  —— 单个 CSS 选择器
  //   LIST_KEYS —— 选择器数组（输入用逗号/换行分隔）
  const STR_KEYS = ['input', 'aiContent', 'userBubble', 'messageList', 'scrollerCandidates', 'conversationList'];
  const LIST_KEYS = ['generatingSelectors', 'captchaSelectors'];
  const EDITABLE_KEYS = STR_KEYS.concat(LIST_KEYS);
  const HL_STYLE_ID = 'dwt-sel-hl-style';
  const HL_CLASS = 'dwt-sel-hl';

  const PANEL_HTML = `
<div id="${PANEL_ID}" style="display:none;position:fixed;bottom:12px;right:12px;width:380px;max-height:80vh;overflow:auto;background:var(--dwt-bg,#fff);border:1px solid var(--dwt-border,#d0d7de);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:12px;z-index:999999;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:#1a1a1a;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <b>Doubao Web Toolkit · 调试面板</b>
    <button id="dwt-panel-close" style="border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;">×</button>
  </div>

  <style>
    /* 说明表格自己带色（表格/单元格不匹配 common.css 的 div 批处理，深色下 #444 会糊成 1.6:1）；
       summary 的行内色要压过必须 !important（同 common.css 深色批的写法）。 */
    html.dwt-ui-dark #${PANEL_ID} summary { color:#7fb0ff !important; }
  </style>
  <details style="margin-bottom:10px;background:var(--dwt-soft,#f6f8fa);border:1px solid var(--dwt-border,#d0d7de);border-radius:6px;padding:6px 8px;">
    <summary style="cursor:pointer;font-weight:600;color:var(--dwt-accent,#2d72de);">使用说明（点击展开）</summary>
    <table style="width:100%;margin-top:6px;border-collapse:collapse;font-size:11px;line-height:1.55;color:var(--dwt-fg,#1f2328);">
      <tbody>
        <tr>
          <td style="width:1%;white-space:nowrap;font-weight:600;color:var(--dwt-fg,#1f2328);padding:4px 6px 4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">DOM 选择器表</td>
          <td style="padding:4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">每行一个选择器，右侧「匹配 N」实时显示当前页面命中元素数（语法错误会标红）。点「测试」把命中元素描边高亮 1.6 秒并滚动到第一个；改完点「保存」写入本地覆盖值（存于 <code>chrome.storage.local.dwt_selectors</code>），无需改代码；点「重置」恢复默认。数组型选择器（generatingSelectors / captchaSelectors）用逗号分隔多个。</td>
        </tr>
        <tr>
          <td style="width:1%;white-space:nowrap;font-weight:600;color:var(--dwt-fg,#1f2328);padding:4px 6px 4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">元素选择模式</td>
          <td style="padding:4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">点按钮进入拾取状态，鼠标移动到页面元素会高亮描边，<b>点击目标元素</b>即自动生成其 CSS 选择器，并复制到剪贴板、回填到下方「回填到」下拉选中的那项；按 <b>ESC</b> 或再次点击按钮退出。</td>
        </tr>
        <tr>
          <td style="width:1%;white-space:nowrap;font-weight:600;color:var(--dwt-fg,#1f2328);padding:4px 6px 4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">实时状态</td>
          <td style="padding:4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">「回复生成中」= 豆包是否正在流式输出；「验证码」= 是否检测到验证码元素。用于排查批量输入为何暂停。</td>
        </tr>
        <tr>
          <td style="width:1%;white-space:nowrap;font-weight:600;color:var(--dwt-fg,#1f2328);padding:4px 6px 4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">打开方式</td>
          <td style="padding:4px 0;vertical-align:top;border-top:1px solid var(--dwt-border,#d0d7de);">配置页（右下角 ⚙ / 扩展图标）内点「打开调试面板」；或派发 <code>dwt-toggle-debug-panel</code>。</td>
        </tr>
      </tbody>
    </table>
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
      <button id="dwt-pick" style="padding:4px 8px;border:1px solid #d0d7de;border-radius:6px;background:var(--dwt-soft,#fff);color:var(--dwt-fg,#1f2328);cursor:pointer;font-size:11px;">元素选择模式</button>
      <label style="font-size:11px;color:#555;">回填到
        <select id="dwt-pick-target" style="font-size:11px;padding:2px 4px;border:1px solid #d0d7de;border-radius:4px;">
          ${EDITABLE_KEYS.map((k) => `<option value="${k}">${k}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="dwt-pick-hint" style="margin-top:6px;font-size:11px;color:#888;"></div>
  </div>
</div>`;
  // 注: 齿轮入口按钮已移至统一工具栏 (core/ui-rail.js 注册, 保留 domId dwt-panel-toggle)

  let pickMode = false;         // 是否处于元素拾取状态
  let hoverBox = null;          // 悬停高亮框
  let pickCleanup = null;       // 退出拾取时的清理函数

  // ---------- 选择器表（可视化编辑：实时匹配计数 + 测试高亮） ----------
  // 一个键的当前生效值：覆盖值优先，否则默认值
  function effectiveValue(k) {
    const sm = window.dwt && window.dwt.selectorManager;
    const def = (sm && sm.DEFAULTS && sm.DEFAULTS[k]);
    const ov = (sm && sm._overrides && sm._overrides[k]);
    if (Array.isArray(ov)) return ov;
    if (typeof ov === 'string' && ov.trim()) return ov;
    return def;
  }

  // 选择器（组）→ 匹配元素数组；语法错误返回 null
  function queryAll(value) {
    const list = Array.isArray(value) ? value : [value];
    const sel = list.filter((s) => typeof s === 'string' && s.trim()).join(',');
    if (!sel) return [];
    try { return Array.from(document.querySelectorAll(sel)); } catch (_) { return null; }
  }

  // 输入框内容 → 生效值（数组键按逗号/换行切分）
  function parseValue(k, raw) {
    if (LIST_KEYS.indexOf(k) >= 0) {
      return String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    }
    return String(raw || '').trim();
  }

  function valueToText(k, value) {
    return Array.isArray(value) ? value.join(', ') : String(value == null ? '' : value);
  }

  function ensureHlStyle() {
    if (document.getElementById(HL_STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = HL_STYLE_ID;
    st.textContent = '.' + HL_CLASS + '{outline:2px dashed #e8590c !important;outline-offset:1px !important;background:rgba(232,89,12,.10) !important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  // 测试高亮：给匹配到的元素描边 1.6s，并把第一个滚进视野
  function highlightMatches(value) {
    ensureHlStyle();
    const els = queryAll(value);
    if (!els || !els.length) return 0;
    els.forEach((el) => el.classList.add(HL_CLASS));
    try { els[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
    setTimeout(() => els.forEach((el) => el.classList.remove(HL_CLASS)), 1600);
    return els.length;
  }

  function setCountText(el, value) {
    if (!el) return;
    const els = queryAll(value);
    if (els === null) {
      el.textContent = '语法错误';
      el.style.color = '#d1242f';
      return;
    }
    el.textContent = '匹配 ' + els.length;
    el.style.color = els.length ? '#1a7f37' : '#8b949e';
  }

  function renderPanel() {
    const table = document.getElementById('dwt-selector-table');
    if (!table) return;
    table.innerHTML = '';
    const sm = window.dwt && window.dwt.selectorManager;
    const defaults = (sm && sm.DEFAULTS) || {};
    const overrides = (sm && sm._overrides) || {};

    EDITABLE_KEYS.forEach((k) => {
      const defVal = defaults[k];
      const isList = LIST_KEYS.indexOf(k) >= 0;
      if (isList ? !Array.isArray(defVal) : typeof defVal !== 'string') return;
      const overridden = Object.prototype.hasOwnProperty.call(overrides, k);

      const row = document.createElement('div');
      row.style.cssText = 'margin:6px 0;padding-bottom:6px;border-bottom:1px dashed #eaeef2;';

      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const label = document.createElement('label');
      label.textContent = k + (isList ? ' (多个, 逗号分隔)' : '');
      label.style.cssText = 'color:#555;font-weight:600;';
      label.title = '默认: ' + valueToText(k, defVal);
      const tag = document.createElement('span');
      tag.textContent = overridden ? '已覆盖' : '默认';
      tag.style.cssText = 'font-size:10px;padding:0 4px;border-radius:4px;'
        + (overridden ? 'background:#fff1e5;color:#bc4c00;' : 'background:#eef2f6;color:#57606a;');
      const count = document.createElement('span');
      count.style.cssText = 'margin-left:auto;font-size:10px;';
      head.appendChild(label);
      head.appendChild(tag);
      head.appendChild(count);

      const body = document.createElement('div');
      body.style.cssText = 'display:flex;gap:4px;margin-top:3px;align-items:flex-start;';
      const input = document.createElement('input');
      input.value = valueToText(k, overridden ? overrides[k] : defVal);
      input.dataset.key = k;
      input.style.cssText = 'flex:1;min-width:0;padding:2px 4px;border:1px solid #d0d7de;border-radius:4px;font-family:Consolas,monospace;font-size:11px;';

      const testBtn = document.createElement('button');
      testBtn.textContent = '测试';
      testBtn.title = '高亮当前选择器匹配到的元素 1.6 秒';
      testBtn.style.cssText = 'padding:2px 6px;border:1px solid var(--dwt-border,#d0d7de);color:var(--dwt-fg,#444);background:var(--dwt-soft,#fff);border-radius:4px;cursor:pointer;font-size:11px;';
      testBtn.addEventListener('click', () => {
        const n = highlightMatches(parseValue(k, input.value));
        flash(testBtn, n ? '高亮 ' + n : '无匹配');
      });

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '保存';
      saveBtn.style.cssText = 'padding:2px 6px;border:1px solid var(--dwt-accent,#2d72de);color:var(--dwt-accent,#2d72de);background:var(--dwt-soft,#fff);border-radius:4px;cursor:pointer;font-size:11px;';
      saveBtn.addEventListener('click', () => saveSelector(k, input.value, saveBtn));

      const resetBtn = document.createElement('button');
      resetBtn.textContent = '重置';
      resetBtn.style.cssText = 'padding:2px 6px;border:1px solid var(--dwt-border,#d0d7de);color:var(--dwt-muted,#666);background:var(--dwt-soft,#fff);border-radius:4px;cursor:pointer;font-size:11px;';
      resetBtn.addEventListener('click', () => resetSelector(k, input));

      body.appendChild(input);
      body.appendChild(testBtn);
      body.appendChild(saveBtn);
      body.appendChild(resetBtn);
      row.appendChild(head);
      row.appendChild(body);
      table.appendChild(row);

      setCountText(count, parseValue(k, input.value));
      // 输入即时预览匹配数（不落盘，需点保存才生效到插件）
      let t = null;
      input.addEventListener('input', () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => setCountText(count, parseValue(k, input.value)), 250);
      });
    });

    // 函数型选择器只读展示（发送按钮用特征匹配，不能文本化）
    const fnRow = document.createElement('div');
    fnRow.style.cssText = 'margin-top:6px;color:#8b949e;font-size:10px;line-height:1.6;';
    fnRow.textContent = 'sendMatch: 函数型选择器（发送按钮按「未禁用 + 含 svg + 靠右下」特征匹配），不可文本编辑。';
    table.appendChild(fnRow);
  }

  // 保存单个选择器覆盖值到 chrome.storage.local.dwt_selectors
  async function saveSelector(key, value, btn) {
    const sm = window.dwt && window.dwt.selectorManager;
    if (!sm) return;
    const next = Object.assign({}, sm._overrides || {});
    const parsed = parseValue(key, value);
    const empty = Array.isArray(parsed) ? parsed.length === 0 : !parsed;
    if (empty) delete next[key]; else next[key] = parsed;
    await sm.save(next);
    sm.invalidate && sm.invalidate();  // 滚动容器等缓存失效，下次重新探测
    flash(btn, '已保存');
    renderPanel();
    console.log(LOG, '选择器已保存', key, '=', next[key]);
  }

  // 重置单个选择器为默认值
  async function resetSelector(key, input) {
    const sm = window.dwt && window.dwt.selectorManager;
    if (!sm) return;
    const next = Object.assign({}, sm._overrides || {});
    delete next[key];
    await sm.save(next);
    sm.invalidate && sm.invalidate();
    renderPanel();
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
    if (!p) return;
    if (p.style.display === 'none') {
      p.style.display = 'block';
      // 显示后再贴一次落盘位置：隐藏期间量不到尺寸，attach 那次可能只算了夹取值
      window.dwt?.drag?.restore?.(p);
      // 读取最新覆盖值再渲染，保证表格显示当前生效值
      Promise.resolve(window.dwt?.selectorManager?.load?.()).then(renderPanel).catch(renderPanel);
      updateLiveState();
      p._t = setInterval(updateLiveState, 1500);
    } else {
      p.style.display = 'none';
      if (p._t) clearInterval(p._t);
      exitPickMode();
    }
  }

  // 统一工具栏入口 (domId 保留 dwt-panel-toggle, live-boot 验收依赖该 id)。
  // 面板 DOM 跨重注入存活，但 rail 实例是新的 → 注册必须与面板挂载分开、每轮都跑。
  function openOptionsPage() {
    try {
      chrome.runtime.sendMessage({ type: 'DWT_OPEN_OPTIONS' }, () => {
        try { void chrome.runtime.lastError; } catch (_) {}
      });
    } catch (_) {}
  }

  function registerRail() {
    try {
      try { window.dwt?.rail?.remove?.('debug'); } catch (_) {}
      window.dwt?.rail?.add?.({
        id: 'debug',
        domId: TOGGLE_ID,
        icon: '⚙',
        title: '配置',
        order: 90,
        onClick: () => openOptionsPage(),
      });
    } catch (_) {}
  }

  // 跨重注入的面板实例指针：窗口级事件/rail 入口永远转发到最新一轮的闭包，
  // 否则老按钮/老监听会继续用老代码渲染（选择器表会退化成旧版）。
  function mount() {
    window.__dwtDebugPanelApi = { toggle, renderPanel, updateLiveState };
    if (!window.__dwtDebugPanelBound) {
      window.__dwtDebugPanelBound = true;
      window.addEventListener('dwt-toggle-debug-panel', () => window.__dwtDebugPanelApi?.toggle?.());
    }
    registerRail();
    try {
      const host = document.body || document.documentElement;
      if (!host) return;
      // 重建面板：老 DOM 上的按钮绑着老闭包，无法安全重绑（重复 addEventListener 会双击切换），
      // 直接整体换新，保证「匹配 N / 测试 / 数组键」等新逻辑立刻生效。
      const prev = document.getElementById(PANEL_ID);
      const wasOpen = prev ? prev.style.display !== 'none' : false;
      if (prev) {
        if (prev._t) clearInterval(prev._t);
        prev.remove();
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = PANEL_HTML;
      host.appendChild(wrap);
      const closeBtn = document.getElementById('dwt-panel-close');
      const pickBtn = document.getElementById('dwt-pick');
      if (closeBtn) closeBtn.addEventListener('click', toggle);
      if (pickBtn) pickBtn.addEventListener('click', enterPickMode);
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        window.dwt?.helpTip?.attach?.(panel.querySelector('b'), HELP);
        // 拖拽：面板头为把手（调试面板 380px 宽，钉在右下角会盖住 rail 菜单）
        window.dwt?.drag?.attach?.(panel, { key: 'debug', handle: panel.firstElementChild });
      }
      if (panel && wasOpen) {
        panel.style.display = 'block';
        panel._t = setInterval(updateLiveState, 1500);
      }
      window.dwt?.captchaDetector?.start?.();
      Promise.resolve(window.dwt?.selectorManager?.load?.()).then(renderPanel).catch(renderPanel);
      updateLiveState();
    } catch (e) {
      console.warn(LOG, 'debug-panel mount failed', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  // Glass live-boot: body may appear a tick later after documentElement mount miss.
  if (!document.getElementById(TOGGLE_ID)) {
    setTimeout(mount, 0);
    setTimeout(mount, 250);
  }
  console.log(LOG, 'debug-panel loaded');
})();
