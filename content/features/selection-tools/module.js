// selection-tools/module.js — 划词语料收藏 + 文字高亮 + LaTeX 快捷复制
// 对应总表: #101 d-picot（划词收藏）、#84 Better_Doubao（语料板 / 高亮 / LaTeX）
// 侧栏收纳放弃（易与豆包原生 UI 冲突）；文件夹仍见 conversation-manager
// 选区工具栏不提供「复制」：豆包原生选区菜单已含复制，避免重复
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const SNIP_KEY = 'dwt_snippets';
  const HL_KEY = 'dwt_highlights';
  const FEAT_KEY = 'dwt_selection_tools';
  const BAR_ID = 'dwt-sel-bar';
  const PANEL_ID = 'dwt-snip-panel';
  const STYLE_ID = 'dwt-sel-style';
  const TOGGLE_ID = 'dwt-snip-toggle';

  // Glass live-boot 会反复 eval 本文件：hot-reload 早退若仍用实例 let，
  // 则 document 上旧 mouseup 与新 ensureBar/onBarClick 各持一份 pendingSelText →
  // 浮层能出、点 📌 却读到空缓存（豆包此时往往已清掉选区）=「选中收藏没反应」。
  // 可变状态挂持久袋；事件只绑一次稳定派发器，每次 eval 只替换 _handleUp。
  const S = dwt._selToolsState || (dwt._selToolsState = {
    enabled: true,
    snippets: [],
    highlights: {}, // { [chatId]: [{ hash, text, color }] }
    barHideTimer: null,
    // 豆包点浮层前常会清掉选区；收藏必须用展示时缓存的文本
    pendingSelText: '',
    pendingSelScope: '', // 'input' | 'output'：决定工具条给不给 🖍
    panelTab: 'snip', // 'snip' 收藏 | 'hl' 高亮 —— 两套列表，避免「语料板里找高亮」
  });

  // ⓘ 用法说明：面板标题右侧与 rail 菜单行标题右侧共用同一份
  const HELP = {
    title: '📌 语料板',
    desc: '两页签各管一套：收藏进面板；高亮只涂色。',
    rows: [
      ['划词', '仅输入框 / 回答区弹出工具条'],
      ['收藏', '选中 → 📌 → 进面板；点条目插入输入框'],
      ['高亮', '选中回答 → 🖍 → 正文涂色；点条目跳转'],
      ['取消', '条目右侧「取消」；高亮也可再选后工具条取消'],
      ['导出 / 清空', '只作用于当前页签'],
    ],
    note: '收藏全局共用；高亮按当前会话，刷新后会补回。',
  };

  function chatId() {
    const m = String(location.pathname || '').match(/\/chat\/(\d+)/);
    return m ? m[1] : 'global';
  }

  function hashText(s) {
    let h = 5381;
    const t = String(s || '');
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h) ^ t.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function injectStyles() {
    // 热重载时覆盖已有样式，避免 STYLE_ID 已存在导致暗色修复不生效
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    st.textContent = `
      /* 配色一律走 --dwt-* 变量：html.dwt-ui-dark（跟随豆包外观）下自动深色 */
      #${BAR_ID} {
        position: fixed; z-index: 999999; display: none; gap: 4px;
        padding: 4px; background: var(--dwt-bg, #fff); border: 1px solid var(--dwt-border, #d0d7de); border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.14); font-size: 12px;
      }
      #${BAR_ID} button {
        border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa); border-radius: 6px;
        padding: 4px 8px; cursor: pointer; font-size: 12px; color: var(--dwt-fg, #1f2328);
      }
      #${BAR_ID} button:hover {
        background: var(--dwt-hover, #e8f0ff); border-color: var(--dwt-accent, #2d72de);
        color: var(--dwt-accent, #2d72de);
      }
      #${TOGGLE_ID} { padding: 0; }
      /* 入口按钮由统一工具栏 (core/ui-rail.js) 承载, 不再 fixed 定位 */
      #${PANEL_ID} {
        position: fixed; right: 12px; bottom: 152px; z-index: 999997;
        width: 260px; max-height: 50vh; overflow: auto; display: none;
        background: var(--dwt-bg, rgba(255,255,255,.98)); border: 1px solid var(--dwt-border, #d0d7de);
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,.14); padding: 10px; font-size: 12px;
        color: var(--dwt-fg, #1f2328);
      }
      #${PANEL_ID} .dwt-snip-head {
        display:flex; justify-content:space-between; align-items:center;
        font-weight:600; margin-bottom:8px; gap: 6px;
      }
      #${PANEL_ID} .dwt-snip-head-tools {
        display:flex; align-items:center; gap: 6px; flex-shrink: 0;
      }
      #${PANEL_ID} .dwt-snip-count { color: var(--dwt-muted, #8b949e); font-weight:400; }
      #${PANEL_ID} .dwt-snip-x {
        border: 0; background: transparent; cursor: pointer;
        font-size: 16px; line-height: 1; padding: 0 2px;
        color: var(--dwt-muted, #8b949e);
      }
      #${PANEL_ID} .dwt-snip-x:hover { color: var(--dwt-fg, #1f2328); }
      #${PANEL_ID} .dwt-snip-tabs {
        display:flex; gap:4px; margin-bottom:8px;
      }
      #${PANEL_ID} .dwt-snip-tabs button {
        flex:1; border:1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa);
        color: var(--dwt-muted, #8b949e); border-radius:6px; padding:4px 6px;
        cursor:pointer; font-size:11px;
      }
      #${PANEL_ID} .dwt-snip-tabs button.dwt-on {
        color: var(--dwt-fg, #1f2328); border-color: var(--dwt-accent, #2d72de);
        background: var(--dwt-hover, #e8f0ff); font-weight:600;
      }
      #${PANEL_ID} .dwt-snip-empty { color: var(--dwt-muted, #8b949e); text-align:center; padding:12px; }
      #${PANEL_ID} .dwt-snip-item {
        border: 1px solid var(--dwt-soft, #eef1f4); border-radius: 8px; padding: 6px 8px; margin-bottom: 6px;
        cursor: pointer; line-height: 1.4;
      }
      #${PANEL_ID} .dwt-snip-item:hover {
        background: var(--dwt-hover, #f0f4ff); border-color: var(--dwt-accent, #c9d8ff);
      }
      #${PANEL_ID} .dwt-snip-item.dwt-hl-row,
      #${PANEL_ID} .dwt-snip-item.dwt-snip-row {
        display:flex; align-items:flex-start; gap:6px;
      }
      #${PANEL_ID} .dwt-snip-item.dwt-hl-row .dwt-snip-item-body,
      #${PANEL_ID} .dwt-snip-item.dwt-snip-row .dwt-snip-item-body { flex:1; min-width:0; }
      #${PANEL_ID} .dwt-snip-item .dwt-hl-badge {
        display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:4px;
        background: rgba(255, 214, 102, 0.95); vertical-align:middle;
      }
      #${PANEL_ID} .dwt-snip-unhl,
      #${PANEL_ID} .dwt-snip-del {
        flex-shrink:0; border:1px solid var(--dwt-border, #d0d7de); background:transparent;
        color: var(--dwt-muted, #8b949e); border-radius:4px; padding:2px 6px;
        cursor:pointer; font-size:10px; line-height:1.4;
      }
      #${PANEL_ID} .dwt-snip-unhl:hover,
      #${PANEL_ID} .dwt-snip-del:hover { color: var(--dwt-fg, #1f2328); border-color: var(--dwt-accent, #2d72de); }
      #${PANEL_ID} .dwt-snip-meta { color: var(--dwt-muted, #8b949e); font-size: 10px; margin-top: 4px; }
      #${PANEL_ID} .dwt-snip-actions { display:flex; gap:4px; margin-top:8px; }
      #${PANEL_ID} .dwt-snip-actions button {
        flex:1; border:1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #fff);
        color: var(--dwt-fg, #1f2328); border-radius:6px;
        padding:4px; cursor:pointer; font-size:11px;
      }
      mark.dwt-hl-flash, mark.dwt-hl-flash * {
        outline: 2px solid #2d72de !important; outline-offset: 2px;
      }
      /* !important: 压过豆包气泡 / theme 清背景 / text-s-color（含 mark 内子节点） */
      /* 浅色：清爽浅黄半透明 + 深字；深色见下方（高不透明亮底 + 深字，一眼能辨） */
      mark.dwt-hl, mark[data-dwt-hl="1"],
      mark.dwt-hl *, mark[data-dwt-hl="1"] * {
        background-image: none !important;
        color: #1f2328 !important;
        -webkit-text-fill-color: #1f2328 !important;
      }
      mark.dwt-hl, mark[data-dwt-hl="1"] {
        background-color: rgba(255, 214, 102, 0.42) !important;
        border-radius: 2px; padding: 0 1px;
        -webkit-box-decoration-break: clone; box-decoration-break: clone;
      }
      mark.dwt-hl-green, mark.dwt-hl-green * { background-color: rgba(183, 235, 143, 0.48) !important; color: #1f2328 !important; -webkit-text-fill-color: #1f2328 !important; }
      mark.dwt-hl-cyan, mark.dwt-hl-cyan * { background-color: rgba(135, 232, 222, 0.48) !important; color: #1f2328 !important; -webkit-text-fill-color: #1f2328 !important; }
      mark.dwt-hl-pink, mark.dwt-hl-pink * { background-color: rgba(255, 173, 210, 0.48) !important; color: #1f2328 !important; -webkit-text-fill-color: #1f2328 !important; }
      /* 深色信号：html.dwt-ui-dark（theme 模块跟豆包）+ html[data-theme="dark"] 兜底。
         Glass 实测二者均在；豆包暗色规则 specificity 高，须带 html 前缀抬一级并盖子节点。
         0.32 琥珀+白字在深底上会「脏黄淹没」——改高不透明亮金/彩底 + 深字保证对比。 */
      html.dwt-ui-dark mark.dwt-hl, html.dwt-ui-dark mark[data-dwt-hl="1"],
      html.dwt-ui-dark mark.dwt-hl *, html.dwt-ui-dark mark[data-dwt-hl="1"] *,
      html.dwt-ui-dark mark.dwt-hl-green, html.dwt-ui-dark mark.dwt-hl-green *,
      html.dwt-ui-dark mark.dwt-hl-cyan, html.dwt-ui-dark mark.dwt-hl-cyan *,
      html.dwt-ui-dark mark.dwt-hl-pink, html.dwt-ui-dark mark.dwt-hl-pink *,
      html[data-theme="dark"] mark.dwt-hl, html[data-theme="dark"] mark[data-dwt-hl="1"],
      html[data-theme="dark"] mark.dwt-hl *, html[data-theme="dark"] mark[data-dwt-hl="1"] *,
      html[data-theme="dark"] mark.dwt-hl-green, html[data-theme="dark"] mark.dwt-hl-green *,
      html[data-theme="dark"] mark.dwt-hl-cyan, html[data-theme="dark"] mark.dwt-hl-cyan *,
      html[data-theme="dark"] mark.dwt-hl-pink, html[data-theme="dark"] mark.dwt-hl-pink * {
        color: #1a1200 !important;
        -webkit-text-fill-color: #1a1200 !important;
      }
      /* 深底上半透明会合成成脏黄：默认色改实心亮金，绿/青/粉用高不透明亮底 */
      html.dwt-ui-dark mark.dwt-hl, html.dwt-ui-dark mark[data-dwt-hl="1"],
      html.dwt-ui-dark mark.dwt-hl *, html.dwt-ui-dark mark[data-dwt-hl="1"] *,
      html[data-theme="dark"] mark.dwt-hl, html[data-theme="dark"] mark[data-dwt-hl="1"],
      html[data-theme="dark"] mark.dwt-hl *, html[data-theme="dark"] mark[data-dwt-hl="1"] * {
        background-color: #e6a817 !important;
      }
      html.dwt-ui-dark mark.dwt-hl-green, html.dwt-ui-dark mark.dwt-hl-green *,
      html[data-theme="dark"] mark.dwt-hl-green, html[data-theme="dark"] mark.dwt-hl-green * {
        background-color: #6fcf3a !important;
        color: #0d1a08 !important;
        -webkit-text-fill-color: #0d1a08 !important;
      }
      html.dwt-ui-dark mark.dwt-hl-cyan, html.dwt-ui-dark mark.dwt-hl-cyan *,
      html[data-theme="dark"] mark.dwt-hl-cyan, html[data-theme="dark"] mark.dwt-hl-cyan * {
        background-color: #2bbdbd !important;
        color: #061818 !important;
        -webkit-text-fill-color: #061818 !important;
      }
      html.dwt-ui-dark mark.dwt-hl-pink, html.dwt-ui-dark mark.dwt-hl-pink *,
      html[data-theme="dark"] mark.dwt-hl-pink, html[data-theme="dark"] mark.dwt-hl-pink * {
        background-color: #f070b0 !important;
        color: #1a0810 !important;
        -webkit-text-fill-color: #1a0810 !important;
      }
      .dwt-latex-btn {
        margin-left: 4px; font-size: 11px; padding: 0 4px; border-radius: 4px;
        border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-bg, #fff);
        cursor: pointer; color: var(--dwt-muted, #57606a);
        vertical-align: middle;
      }
      .dwt-latex-btn:hover { color: var(--dwt-accent, #2d72de); border-color: var(--dwt-accent, #2d72de); }
    `;
  }

  async function loadStore() {
    try {
      const r = await chrome.storage.local.get([SNIP_KEY, HL_KEY, FEAT_KEY]);
      if (r[FEAT_KEY] === false) S.enabled = false;
      S.snippets = Array.isArray(r[SNIP_KEY]) ? r[SNIP_KEY] : [];
      S.highlights = r[HL_KEY] && typeof r[HL_KEY] === 'object' ? r[HL_KEY] : {};
    } catch (_) { /* mock / 无 storage */ }
  }

  async function saveSnippets() {
    try { await chrome.storage.local.set({ [SNIP_KEY]: S.snippets.slice(0, 200) }); } catch (_) {}
  }

  async function saveHighlights() {
    try { await chrome.storage.local.set({ [HL_KEY]: S.highlights }); } catch (_) {}
  }

  function getSelectionText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    return (sel.toString() || '').trim();
  }

  // 划词范围：只认「问答区」= 输入框（提问）+ 消息区（回答）。
  // 侧栏会话列表、设置弹窗、插件自己的面板里划词一律返回 ''（不出工具条）——
  // 那些位置的文字既不该被高亮，也不该混进语料板。
  function scopeOf(node) {
    if (!node || !node.closest) return '';
    // 插件自身 UI（工具条 / 语料板 / 各面板 / rail 菜单）先排掉，否则选中面板里的文字也会弹
    try {
      if (node.closest('#' + BAR_ID) || node.closest('[id^="dwt-"]')) return '';
    } catch (_) { return ''; }
    if (node.closest('.ProseMirror') || node.closest('[contenteditable="true"]')) return 'input';
    const sm = dwt.selectorManager;
    let aiSel = '';
    let userSel = '';
    try {
      aiSel = (sm && sm.getAiContent && sm.getAiContent()) || '';
      userSel = (sm && sm.getUserBubble && sm.getUserBubble()) || '';
    } catch (_) { /* 覆盖选择器非法 → 退化为只认滚动容器 */ }
    try {
      if (aiSel && node.closest(aiSel)) return 'output';
      if (userSel && node.closest(userSel)) return 'output';
    } catch (_) { /* 忽略 */ }
    // 长会话里正文 / 思考块不一定落在上面两个容器里，用消息滚动容器兜一层；
    // 但侧栏会话列表也在某个 scroller 里，必须排掉
    let sc = null;
    try { sc = (sm && sm.getScroller && sm.getScroller()) || null; } catch (_) { sc = null; }
    if (sc && sc.contains(node)) {
      let listSel = '';
      try { listSel = (sm.getConversationList && sm.getConversationList()) || ''; } catch (_) { listSel = ''; }
      try { if (listSel && node.closest(listSel)) return ''; } catch (_) { /* 忽略 */ }
      return 'output';
    }
    return '';
  }

  // 恢复高亮的搜索范围 = 问答区（消息滚动容器 + 用户气泡 + AI 内容块）。
  // 绝不落到 document.body：那会把侧栏 / 设置里同名的字也包成高亮。
  function messageRoots() {
    const out = [];
    const sm = dwt.selectorManager;
    let sc = null;
    try { sc = (sm && sm.getScroller && sm.getScroller()) || null; } catch (_) { sc = null; }
    if (sc) out.push(sc);
    const sels = [];
    try { if (sm && sm.getAiContent) { const s = sm.getAiContent(); if (s) sels.push(s); } } catch (_) { /* 忽略 */ }
    try { if (sm && sm.getUserBubble) { const s = sm.getUserBubble(); if (s) sels.push(s); } } catch (_) { /* 忽略 */ }
    sels.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el) => { if (out.indexOf(el) < 0) out.push(el); });
      } catch (_) { /* 忽略 */ }
    });
    return out;
  }

  function isInEditable(node) {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (!el || !el.closest) return false;
    try { return !!(el.closest('.ProseMirror') || el.closest('[contenteditable="true"]')); } catch (_) { return false; }
  }

  function insertIntoInput(text) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) { alert('输入框未找到'); return false; }
    const chunk = String(text || '');
    if (!chunk) return false;
    pm.focus();
    // 禁止 pm.innerHTML 直写：ProseMirror 内部 state 与被替换的 DOM 失配后，
    // 下一次事务/渲染即抛 removeChild NotFoundError，整页 React 应用崩溃（只能重开页面）。
    // 必须走输入事件链（execCommand → beforeinput/input），让 PM 自己记账。
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(pm);
      sel.collapseToEnd();
      const hasText = (pm.textContent || '').trim().length > 0;
      if (hasText) document.execCommand('insertParagraph'); // 等价旧逻辑的换行拼接
      if (!document.execCommand('insertText', false, chunk)) throw new Error('execCommand rejected');
      return true;
    } catch (_) {
      // 兜底：仅派发输入事件，仍不触碰 PM 的 DOM 结构
      try {
        pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: chunk }));
        pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: chunk }));
        return true;
      } catch (_) { return false; }
    }
  }

  function selectionHighlightMark() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    try {
      const range = sel.getRangeAt(0);
      const nodes = [range.commonAncestorContainer, range.startContainer, range.endContainer];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n) continue;
        const el = n.nodeType === 1 ? n : n.parentElement;
        const mark = el && el.closest ? el.closest('mark[data-dwt-hl="1"]') : null;
        if (mark) return mark;
      }
    } catch (_) {}
    return null;
  }

  function showBar(x, y, scope) {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    S.pendingSelText = getSelectionText();
    S.pendingSelScope = scope || 'output';
    // 输入框里只留 📌 收藏：在 ProseMirror 里包 mark 会让它的内部 state 与被改的 DOM 失配
    const hl = bar.querySelector('button[data-act="hl"], button[data-act="unhl"]');
    if (hl) {
      if (S.pendingSelScope === 'input') {
        hl.style.display = 'none';
      } else {
        hl.style.display = '';
        // 选区已在高亮块内（或缓存文本已是高亮）→ 按钮改成「取消高亮」
        const inHl = !!selectionHighlightMark() || alreadyHighlighted(S.pendingSelText);
        hl.dataset.act = inHl ? 'unhl' : 'hl';
        hl.textContent = inHl ? '取消高亮' : '🖍 高亮';
      }
    }
    bar.style.display = 'flex';
    const pad = 8;
    const left = Math.min(window.innerWidth - 220, Math.max(pad, x));
    const top = Math.min(window.innerHeight - 48, Math.max(pad, y));
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
    if (S.barHideTimer) clearTimeout(S.barHideTimer);
    S.barHideTimer = setTimeout(hideBar, 8000);
  }

  function hideBar() {
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.style.display = 'none';
    S.pendingSelText = '';
    S.pendingSelScope = '';
  }

  function flashToast(msg) {
    let t = document.getElementById('dwt-snip-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'dwt-snip-toast';
      t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;z-index:1000000;left:50%;bottom:72px;transform:translateX(-50%);'
        + 'background:var(--dwt-toast-bg,#1f2328);color:var(--dwt-toast-fg,#fff);'
        + 'padding:8px 14px;border-radius:8px;font-size:12px;'
        + 'pointer-events:none;opacity:0;transition:opacity .15s;box-shadow:0 4px 14px rgba(0,0,0,.2)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._dwtHide);
    t._dwtHide = setTimeout(() => { t.style.opacity = '0'; }, 1400);
  }

  function ensureBar() {
    // 热重载时重建，保证 click 绑到新闭包（含 pendingSelText）
    const old = document.getElementById(BAR_ID);
    if (old) old.remove();
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML =
      '<button type="button" data-act="snip">📌 收藏</button>'
      + '<button type="button" data-act="hl">🖍 高亮</button>';
    bar.addEventListener('mousedown', (e) => e.preventDefault()); // 尽量保住选区（高亮仍需要 Range）
    bar.addEventListener('click', onBarClick);
    document.body.appendChild(bar);
  }

  async function onBarClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    // 优先用划词展示浮层时缓存的文本（挂 S，跨 hot-reload 共享）；选区被豆包清掉时 live getSelection 为空
    const text = (S.pendingSelText || getSelectionText()).trim();
    if (!text) { hideBar(); return; }
    const act = btn.dataset.act;
    if (act === 'snip') {
      S.snippets.unshift({
        id: Date.now().toString(36),
        text: text.slice(0, 2000),
        chatId: chatId(),
        at: Date.now(),
      });
      await saveSnippets();
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = 'block';
      renderPanel();
      flashToast('已收藏到语料板');
      hideBar();
      return;
    }
    if (act === 'hl') {
      // 输入框里不高亮：改 ProseMirror 的 DOM 会让它下一次事务抛错、整页 React 崩
      if (S.pendingSelScope === 'input') { hideBar(); return; }
      const ok = applyHighlight(text, 'dwt-hl');
      const id = chatId();
      if (!S.highlights[id]) S.highlights[id] = [];
      const h = hashText(text);
      if (!S.highlights[id].some((x) => x.hash === h)) {
        S.highlights[id].push({ hash: h, text: text.slice(0, 500), color: 'dwt-hl' });
        await saveHighlights();
      }
      if (ok) flashToast('已高亮');
      else flashToast('高亮失败：请重选文字');
      hideBar();
      return;
    }
    if (act === 'unhl') {
      if (S.pendingSelScope === 'input') { hideBar(); return; }
      const ok = removeHighlight(text);
      if (ok) flashToast('已取消高亮');
      else flashToast('未找到可取消的高亮');
      hideBar();
    }
  }

  function makeMark(colorClass) {
    const mark = document.createElement('mark');
    mark.className = colorClass || 'dwt-hl';
    mark.dataset.dwtHl = '1';
    return mark;
  }

  function applyHighlight(text, colorClass) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      try {
        const range = sel.getRangeAt(0);
        // 兜底：范围落在编辑器里就整个放弃（工具条在输入区不给 🖍，但键盘/程序改选区仍可能走到这）
        if (isInEditable(range.startContainer) || isInEditable(range.endContainer)) return false;
        const mark = makeMark(colorClass);
        try {
          range.surroundContents(mark);
        } catch (_) {
          // 跨 span/公式等复杂节点时 surroundContents 会抛错；改为抽内容再包一层
          const frag = range.extractContents();
          mark.appendChild(frag);
          range.insertNode(mark);
        }
        sel.removeAllRanges();
        return true;
      } catch (_) { /* fall through to text restore */ }
    }
    // 选区被豆包清掉时：用缓存文本在页面里定位并包裹
    if (text) return restoreOneHighlight(text, colorClass || 'dwt-hl');
    return false;
  }

  function alreadyHighlighted(text) {
    const needle = String(text || '').trim();
    if (!needle) return false;
    const marks = document.querySelectorAll('mark[data-dwt-hl="1"]');
    for (let i = 0; i < marks.length; i++) {
      const t = (marks[i].textContent || '').trim();
      if (t === needle || t.indexOf(needle) !== -1 || needle.indexOf(t) !== -1) return true;
    }
    return false;
  }

  function unwrapMark(mark) {
    if (!mark || !mark.parentNode) return;
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    try { parent.normalize(); } catch (_) {}
  }

  function removeHighlightFromStore(text) {
    const needle = String(text || '').trim();
    if (!needle) return;
    const h = hashText(needle);
    const slice = needle.slice(0, 500);
    let changed = false;
    Object.keys(S.highlights || {}).forEach((cid) => {
      const list = S.highlights[cid];
      if (!Array.isArray(list)) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (!it) continue;
        if (it.hash === h || it.text === slice
          || (it.text && (it.text.indexOf(slice) !== -1 || slice.indexOf(it.text) !== -1))) {
          list.splice(i, 1);
          changed = true;
        }
      }
    });
    if (changed) void saveHighlights();
  }

  // 取消高亮：拆掉正文 mark，并从未会话存储里删掉对应记录（否则刷新又补回来）
  function removeHighlight(text) {
    const needle = String(text || '').trim();
    let removed = 0;
    const hit = selectionHighlightMark();
    if (hit) {
      const t = (hit.textContent || '').trim() || needle;
      unwrapMark(hit);
      removeHighlightFromStore(t);
      removed += 1;
    } else if (needle) {
      const marks = Array.from(document.querySelectorAll('mark[data-dwt-hl="1"]'));
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        if (!m || !m.isConnected) continue;
        const t = (m.textContent || '').trim();
        if (t === needle || t.indexOf(needle) !== -1 || needle.indexOf(t) !== -1) {
          unwrapMark(m);
          removeHighlightFromStore(t || needle);
          removed += 1;
        }
      }
    }
    return removed > 0;
  }

  /** 在问答区按纯文本定位并包一层 mark（刷新后从 storage 恢复） */
  function restoreOneHighlight(text, colorClass) {
    const needle = String(text || '').trim();
    if (!needle || alreadyHighlighted(needle)) return false;
    const roots = messageRoots();
    for (let r = 0; r < roots.length; r++) {
      if (wrapFirstTextMatch(roots[r], needle, colorClass)) return true;
    }
    // 问答区里找不到（消息被虚拟化滚掉了 / 会话已切换）就不补：宁缺勿滥，
    // 绝不回落到 document.body 去包侧栏、设置里同名的字
    return false;
  }

  // 恢复高亮时的文本节点准入：插件 UI / 侧栏会话列表 / 编辑器 / 已高亮过的节点一律跳过。
  // 两个 walker 共用，避免「只改了一处、另一处又把侧栏包了」。
  function acceptTextNode(p) {
    if (!p || !p.closest) return false;
    try {
      if (p.closest('mark[data-dwt-hl="1"]')) return false;
      if (p.closest('#' + BAR_ID) || p.closest('#' + PANEL_ID)) return false;
      if (p.closest('[id^="dwt-"]')) return false;
      if (p.closest('.ProseMirror') || p.closest('[contenteditable="true"]')) return false;
      const sm = dwt.selectorManager;
      const listSel = (sm && sm.getConversationList && sm.getConversationList()) || '';
      if (listSel && p.closest(listSel)) return false;
    } catch (_) { return false; }
    return true;
  }

  function wrapFirstTextMatch(root, needle, colorClass) {
    if (!root || !needle) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
        return acceptTextNode(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    // 单 text 节点内命中
    let n;
    while ((n = walker.nextNode())) {
      const val = n.nodeValue;
      const idx = val.indexOf(needle);
      if (idx === -1) continue;
      try {
        const range = document.createRange();
        range.setStart(n, idx);
        range.setEnd(n, idx + needle.length);
        const mark = makeMark(colorClass);
        range.surroundContents(mark);
        return true;
      } catch (_) { /* try next */ }
    }
    // 跨 text 节点：拼 contiguous 再 range
    return wrapAcrossTextNodes(root, needle, colorClass);
  }

  function wrapAcrossTextNodes(root, needle, colorClass) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
        return acceptTextNode(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    let flat = '';
    const map = []; // flat index → { node, offset }
    for (let i = 0; i < nodes.length; i++) {
      const t = nodes[i].nodeValue;
      for (let j = 0; j < t.length; j++) {
        map.push({ node: nodes[i], offset: j });
      }
      flat += t;
    }
    const idx = flat.indexOf(needle);
    if (idx === -1) return false;
    const start = map[idx];
    const end = map[idx + needle.length - 1];
    if (!start || !end) return false;
    try {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset + 1);
      const mark = makeMark(colorClass);
      try {
        range.surroundContents(mark);
      } catch (_) {
        const frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreHighlights() {
    const id = chatId();
    const list = [].concat(S.highlights[id] || [], id !== 'global' ? (S.highlights.global || []) : []);
    let applied = 0;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || !item.text) continue;
      if (restoreOneHighlight(item.text, item.color || 'dwt-hl')) applied += 1;
    }
    return applied;
  }

  function scheduleRestoreHighlights() {
    // 豆包消息异步渲染：挂载后多轮重试
    const delays = [0, 400, 1200, 3000, 6000];
    delays.forEach((ms) => setTimeout(() => {
      try { restoreHighlights(); } catch (_) {}
    }, ms));
  }

  // 拖拽：面板头为把手（语料板钉在右下角，会压住输入区）。
  // 面板 DOM 跨重注入存活、监听却绑在旧实例上，所以「新建」「复用」「hot-reload 早退」三条路都要重挂 —— attach 幂等。
  function bindDrag(panel) {
    // 整行标题可拖；按钮在 capture 里 stopPropagation，避免点 × / ⓘ 文字节点时
    // panel-drag 因 Text 无 closest 而 preventDefault 吞掉 click。
    const head = panel.querySelector('.dwt-snip-head');
    if (!head) return;
    const title = panel.querySelector('.dwt-snip-drag')
      || head.querySelector(':scope > span:not(.dwt-snip-head-tools)');
    if (title && !title.classList.contains('dwt-snip-drag')) title.classList.add('dwt-snip-drag');
    shieldHeadButtons(panel);
    window.dwt?.drag?.attach?.(panel, {
      key: 'snip',
      handle: head,
      exclude: 'button,a,input,textarea,select,label,#dwt-snip-x,.dwt-snip-x,.dwt-help-btn,.dwt-no-drag',
    });
  }

  function shieldHeadButtons(panel) {
    const head = panel && panel.querySelector('.dwt-snip-head');
    if (!head) return;
    head.querySelectorAll('button').forEach((btn) => {
      if (btn.dataset.dwtPtrShield === '1') return;
      btn.dataset.dwtPtrShield = '1';
      btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);
    });
  }

  function hidePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
  }

  // 已存在的面板（跨注入存活）可能还没有 ×：补上头栏关闭钮。
  // 必须用 onclick 覆盖：cloneNode 会抄走 data-dwt-bound 却不抄 listener，
  // 旧「绑一次」逻辑会让 × 在重注入后永久失效。
  function ensureCloseBtn(panel) {
    if (!panel) return;
    let btn = panel.querySelector('#dwt-snip-x');
    if (!btn) {
      let tools = panel.querySelector('.dwt-snip-head-tools');
      if (!tools) {
        const head = panel.querySelector('.dwt-snip-head');
        if (!head) return;
        tools = document.createElement('span');
        tools.className = 'dwt-snip-head-tools';
        const count = head.querySelector('#dwt-snip-count');
        if (count) tools.appendChild(count);
        head.appendChild(tools);
      }
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'dwt-snip-x';
      btn.className = 'dwt-snip-x';
      btn.setAttribute('aria-label', '关闭语料板');
      btn.textContent = '×';
      tools.appendChild(btn);
    }
    delete btn.dataset.dwtBound;
    // × 曾在拖拽把手内：点到「×」文字节点时 target 是 Text，
    // panel-drag 的 closest(button) 失效会 preventDefault(pointerdown)，后续 click 被吃掉。
    // 现把手已缩到标题；pointerdown 仍 stop，避免冒泡到旧 head 残留监听。
    btn.onpointerdown = (e) => { e.stopPropagation(); };
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hidePanel();
    };
  }

  function currentHighlights() {
    const id = chatId();
    const list = (S.highlights && S.highlights[id]) || [];
    return Array.isArray(list) ? list.slice() : [];
  }

  function scrollToHighlight(text) {
    const needle = String(text || '').trim();
    if (!needle) return false;
    const marks = document.querySelectorAll('mark[data-dwt-hl="1"]');
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const t = (m.textContent || '').trim();
      if (t === needle || t.indexOf(needle) !== -1 || needle.indexOf(t) !== -1) {
        try { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        m.classList.add('dwt-hl-flash');
        setTimeout(() => { try { m.classList.remove('dwt-hl-flash'); } catch (_) {} }, 1400);
        return true;
      }
    }
    flashToast('正文里暂时找不到这段（可能被滚出虚拟列表）');
    return false;
  }

  function ensureTabs(panel) {
    if (!panel || panel.querySelector('.dwt-snip-tabs')) return;
    const head = panel.querySelector('.dwt-snip-head');
    if (!head) return;
    const tabs = document.createElement('div');
    tabs.className = 'dwt-snip-tabs';
    tabs.innerHTML =
      '<button type="button" data-tab="snip">📌 收藏</button>'
      + '<button type="button" data-tab="hl">🖍 高亮</button>';
    head.insertAdjacentElement('afterend', tabs);
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML =
        '<div class="dwt-snip-head"><span class="dwt-snip-drag">📌 语料板</span>'
        + '<span class="dwt-snip-head-tools">'
        + '<span id="dwt-snip-count" class="dwt-snip-count"></span>'
        + '<button type="button" id="dwt-snip-x" class="dwt-snip-x" aria-label="关闭语料板">×</button>'
        + '</span></div>'
        + '<div class="dwt-snip-tabs">'
        + '<button type="button" data-tab="snip">📌 收藏</button>'
        + '<button type="button" data-tab="hl">🖍 高亮</button>'
        + '</div>'
        + '<div id="dwt-snip-list"></div>'
        + '<div class="dwt-snip-actions">'
        + '<button type="button" id="dwt-snip-export">导出收藏</button>'
        + '<button type="button" id="dwt-snip-clear">清空收藏</button>'
        + '</div>';
      document.body.appendChild(panel);
      bindPanel(panel);
    }
    ensureTabs(panel);
    ensureCloseBtn(panel);
    // 标题右侧 ⓘ：悬停出表格化说明（面板跨重注入存活，两条路都要挂；attach 幂等）
    window.dwt?.helpTip?.attach?.(panel.querySelector('.dwt-snip-drag') || panel.querySelector('.dwt-snip-head > span'), HELP);
    bindDrag(panel);
    shieldHeadButtons(panel); // helpTip 新挂的 ⓘ 也要挡拖拽
  }

  function bindPanel(panel) {
    // onclick 覆盖：重注入不会叠多个旧监听（旧版 addEventListener 会导致点「高亮」页签无效）
    panel.onclick = (e) => {
      const closeBtn = e.target.closest && e.target.closest('#dwt-snip-x, .dwt-snip-x');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        hidePanel();
        return;
      }
      const tabBtn = e.target.closest && e.target.closest('.dwt-snip-tabs [data-tab]');
      if (tabBtn) {
        S.panelTab = tabBtn.getAttribute('data-tab') === 'hl' ? 'hl' : 'snip';
        renderPanel();
        return;
      }
      const unhl = e.target.closest && e.target.closest('.dwt-snip-unhl');
      if (unhl) {
        e.preventDefault();
        e.stopPropagation();
        const text = unhl.getAttribute('data-text') || '';
        if (removeHighlight(text)) {
          flashToast('已取消高亮');
          renderPanel();
        } else {
          flashToast('未找到可取消的高亮');
        }
        return;
      }
      const del = e.target.closest && e.target.closest('.dwt-snip-del');
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        const sid = del.getAttribute('data-id') || '';
        const before = S.snippets.length;
        if (sid) S.snippets = S.snippets.filter((s) => String(s.id) !== sid);
        else {
          const text = del.getAttribute('data-text') || '';
          const ix = S.snippets.findIndex((s) => s && s.text === text);
          if (ix >= 0) S.snippets.splice(ix, 1);
        }
        if (S.snippets.length !== before) {
          void saveSnippets();
          flashToast('已取消收藏');
          renderPanel();
        }
        return;
      }
      const hlItem = e.target.closest && e.target.closest('.dwt-snip-item.dwt-hl-row');
      if (hlItem && hlItem.dataset.text) {
        scrollToHighlight(hlItem.dataset.text);
        return;
      }
      const item = e.target.closest && e.target.closest('.dwt-snip-item.dwt-snip-row, .dwt-snip-item:not(.dwt-hl-row)');
      if (item && item.dataset.text && !item.classList.contains('dwt-hl-row')
        && !(e.target.closest && e.target.closest('.dwt-snip-del'))) {
        insertIntoInput(item.dataset.text);
      }
    };
    const exp = panel.querySelector('#dwt-snip-export');
    const clr = panel.querySelector('#dwt-snip-clear');
    if (exp) {
      exp.onclick = () => {
        if (S.panelTab === 'hl') {
          const list = currentHighlights();
          const md = list.map((s, i) => (i + 1) + '. ' + (s.text || '')).join('\n\n');
          const blob = new Blob([md || '(空)'], { type: 'text/markdown;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'dwt-highlights.md';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          return;
        }
        const md = S.snippets.map((s, i) => (i + 1) + '. ' + s.text).join('\n\n');
        const blob = new Blob([md || '(空)'], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dwt-snippets.md';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
    }
    if (clr) {
      clr.onclick = async () => {
        if (S.panelTab === 'hl') {
          if (!confirm('清空本会话全部高亮？')) return;
          const id = chatId();
          S.highlights[id] = [];
          document.querySelectorAll('mark[data-dwt-hl="1"]').forEach((m) => unwrapMark(m));
          await saveHighlights();
          renderPanel();
          flashToast('已清空高亮');
          return;
        }
        if (!confirm('清空全部收藏？')) return;
        S.snippets = [];
        await saveSnippets();
        renderPanel();
        flashToast('已清空收藏');
      };
    }
    ensureCloseBtn(panel);
  }

  function renderPanel() {
    const panel = document.getElementById(PANEL_ID);
    const list = document.getElementById('dwt-snip-list');
    const count = document.getElementById('dwt-snip-count');
    if (!list) return;
    const tab = S.panelTab === 'hl' ? 'hl' : 'snip';
    if (panel) {
      panel.querySelectorAll('.dwt-snip-tabs [data-tab]').forEach((b) => {
        b.classList.toggle('dwt-on', b.getAttribute('data-tab') === tab);
      });
      const exp = panel.querySelector('#dwt-snip-export');
      const clr = panel.querySelector('#dwt-snip-clear');
      if (exp) exp.textContent = tab === 'hl' ? '导出高亮' : '导出收藏';
      if (clr) clr.textContent = tab === 'hl' ? '清空高亮' : '清空收藏';
    }
    if (tab === 'hl') {
      const hls = currentHighlights();
      if (count) count.textContent = '高亮 ' + hls.length + ' 条';
      if (!hls.length) {
        list.innerHTML = '<div class="dwt-snip-empty">选中回答文字 → 🖍 高亮<br/>高亮在正文涂色，点条目可跳转</div>';
        return;
      }
      list.innerHTML = hls.map((s) => {
        const t = String(s.text || '');
        return '<div class="dwt-snip-item dwt-hl-row" data-text="' + escapeHtml(t) + '">'
          + '<div class="dwt-snip-item-body">'
          + '<span class="dwt-hl-badge" aria-hidden="true"></span>'
          + escapeHtml(t.slice(0, 120)) + (t.length > 120 ? '…' : '')
          + '<div class="dwt-snip-meta">点此跳到正文</div>'
          + '</div>'
          + '<button type="button" class="dwt-snip-unhl" data-text="' + escapeHtml(t) + '" title="取消高亮">取消</button>'
          + '</div>';
      }).join('');
      return;
    }
    if (count) count.textContent = '收藏 ' + S.snippets.length + ' 条';
    if (!S.snippets.length) {
      list.innerHTML = '<div class="dwt-snip-empty">选中文字 → 📌 收藏</div>';
      return;
    }
    list.innerHTML = S.snippets.map((s) => {
      const t = String(s.text || '');
      const sid = String(s.id || '');
      return '<div class="dwt-snip-item dwt-snip-row" data-text="' + escapeHtml(t) + '" data-id="' + escapeHtml(sid) + '">'
        + '<div class="dwt-snip-item-body">'
        + escapeHtml(t.slice(0, 120)) + (t.length > 120 ? '…' : '')
        + '<div class="dwt-snip-meta">' + new Date(s.at || Date.now()).toLocaleString() + ' · 点此插入输入框</div>'
        + '</div>'
        + '<button type="button" class="dwt-snip-del" data-id="' + escapeHtml(sid) + '" data-text="' + escapeHtml(t) + '" title="取消收藏">取消</button>'
        + '</div>';
    }).join('');
  }

  function ensureToggle() {
    // 关功能时不要挂入口：setVisible 藏行扛不住后续 render，且 defs 会被 boot 复活
    if (!S.enabled) {
      try { window.dwt?.rail?.remove?.('snip'); } catch (_) {}
      return;
    }
    // 入口只挂面板内 ⓘ；rail 旁注不再挂 help（面板已打开时再滑过菜单会重复弹提示）
    // 重注入时强制 remove+add，清掉旧版带 help 的标签
    try { window.dwt?.rail?.remove?.('snip'); } catch (_) {}
    window.dwt?.rail?.add?.({
      id: 'snip',
      domId: TOGGLE_ID,
      icon: '📌',
      title: '语料板',
      order: 20,
      onClick: () => {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const open = panel.style.display === 'block';
        panel.style.display = open ? 'none' : 'block';
        if (!open) {
          window.dwt?.drag?.restore?.(panel);
          bindDrag(panel);
          renderPanel();
        }
      },
    });
  }

  function selAnchorEl() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const nodes = [sel.anchorNode, sel.focusNode];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const el = n.nodeType === 1 ? n : n.parentElement;
      if (el) return el;
    }
    return null;
  }

  function onMouseUp(e) {
    if (!S.enabled) return;
    // 点工具条本身：别重入。语料板/其它 #dwt-* 上松开时仍可能刚划完词 —— 用选区锚点判范围，不看 e.target。
    try {
      if (e.target && e.target.closest && e.target.closest('#' + BAR_ID)) return;
    } catch (_) { /* 忽略 */ }
    const text = getSelectionText();
    if (text.length < 2) { hideBar(); return; }
    // 只在问答区出工具条：范围看选区锚点（Glass 上松手常落在浮层面板/rail 上，e.target 会误判为空）
    const anchor = selAnchorEl() || (e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement));
    const scope = scopeOf(anchor);
    if (!scope) { hideBar(); return; }
    let x = (e.clientX || 0) + 8;
    let y = (e.clientY || 0) + 8;
    try {
      if (e.target && e.target.closest && e.target.closest('[id^="dwt-"]')) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0).getBoundingClientRect();
          if (r && (r.width || r.height)) {
            x = Math.round(r.right) + 8;
            y = Math.round(r.bottom) + 8;
          }
        }
      }
    } catch (_) { /* 忽略 */ }
    showBar(x, y, scope);
  }

  // LaTeX: 悬停公式显示复制按钮
  function bindLatex() {
    document.querySelectorAll('.katex, [class*="katex"], .math, mjx-container').forEach((el) => {
      if (el.dataset.dwtLatexBound) return;
      el.dataset.dwtLatexBound = '1';
      el.addEventListener('mouseenter', () => {
        if (el.querySelector('.dwt-latex-btn')) return;
        const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent
          || el.getAttribute('data-latex')
          || el.getAttribute('aria-label')
          || '';
        if (!tex.trim()) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dwt-latex-btn';
        btn.textContent = 'TeX';
        btn.title = '复制 LaTeX';
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          try { await navigator.clipboard.writeText(tex.trim()); btn.textContent = '已复制'; } catch (_) {}
          setTimeout(() => { btn.textContent = 'TeX'; }, 1000);
        });
        el.appendChild(btn);
      });
    });
  }

  function setEnabled(v) {
    S.enabled = !!v;
    const panel = document.getElementById(PANEL_ID);
    if (!S.enabled) {
      hideBar();
      if (panel) panel.style.display = 'none';
      try { window.dwt?.rail?.remove?.('snip'); } catch (_) {}
      return;
    }
    try { ensureToggle(); } catch (_) {}
  }

  // 稳定派发：只绑一次。每次 eval 把最新 onMouseUp 挂到 module._handleUp，
  // 避免 Glass 重注入后旧闭包与新 bar click 分裂。
  //
  // 必须挂 window capture：豆包会在 window 捕获阶段 stopPropagation 划词鼠标事件，
  // document 监听在 page world（live-boot）里收不到；扩展 isolated world 不受影响，
  // 所以「外置正常、Glass 没反应」。selectionchange 作补刀（松手被吃掉时仍能出条）。
  function dispatchSelUp(e) {
    const mod = dwt.selectionToolsModule;
    const fn = mod && mod._handleUp;
    if (typeof fn === 'function') fn(e);
  }

  function dispatchSelPointerUp(e) {
    // 鼠标会再走 mouseup；这里只补触控/笔，避免弹两次
    if (e && (e.pointerType === 'mouse' || e.pointerType === '')) return;
    dispatchSelUp(e);
  }

  let selChangeTimer = null;
  function dispatchSelChange() {
    if (selChangeTimer) clearTimeout(selChangeTimer);
    selChangeTimer = setTimeout(function () {
      selChangeTimer = null;
      const mod = dwt.selectionToolsModule;
      if (!mod || typeof mod._handleUp !== 'function') return;
      if (!S.enabled) return;
      const text = getSelectionText();
      if (text.length < 2) return;
      const bar = document.getElementById(BAR_ID);
      if (bar && bar.style.display === 'flex') {
        // 已出条：只刷新缓存，防止豆包随后清选区
        S.pendingSelText = text;
        return;
      }
      const anchor = selAnchorEl();
      const scope = scopeOf(anchor);
      if (!scope) return;
      let x = 40;
      let y = 40;
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0).getBoundingClientRect();
          if (r && (r.width || r.height)) {
            x = Math.round(r.right) + 8;
            y = Math.round(r.bottom) + 8;
          }
        }
      } catch (_) { /* 忽略 */ }
      mod._handleUp({
        target: anchor || document.body,
        clientX: x - 8,
        clientY: y - 8,
        closest: function () { return null; },
      });
    }, 180);
  }

  function bindSelListeners() {
    dwt.selectionToolsModule._handleUp = onMouseUp;
    // ver 2 = window capture + selectionchange（ver 1 只绑了 document，Glass 下会被豆包吃掉）
    if (dwt._selToolsBound === 2) return;
    dwt._selToolsBound = 2;
    // window capture 才能赶到 document 之前；豆包 stopPropagation 后 document 收不到
    window.addEventListener('mouseup', dispatchSelUp, true);
    window.addEventListener('pointerup', dispatchSelPointerUp, true);
    document.addEventListener('selectionchange', dispatchSelChange);
  }

  function mount() {
    if (!S.enabled) return;
    injectStyles();
    ensureBar();
    ensurePanel();
    ensureToggle();
    renderPanel();
    bindSelListeners();
    bindLatex();
    setInterval(bindLatex, 3000);
    scheduleRestoreHighlights();
  }

  function hotReload() {
    injectStyles();
    ensureBar();
    bindSelListeners();
    // 不重拉 snippets/highlights：Glass 扫注入时 storage 桥偶发慢/空，
    // loadStore 用 [] 盖掉内存袋会把刚 📌 的语料抹掉。袋跨 eval 存活，只同步开关。
    // 先读开关再挂 rail；storage 桥空包时禁止把已关闭的语料板挂回去
    try {
      Promise.resolve(chrome.storage.local.get(FEAT_KEY)).then(function (r) {
        if (r && Object.prototype.hasOwnProperty.call(r, FEAT_KEY)) {
          if (r[FEAT_KEY] === false) {
            S.enabled = false;
            setEnabled(false);
          } else {
            S.enabled = true;
            ensureToggle();
            scheduleRestoreHighlights();
          }
          return;
        }
        if (S.enabled) {
          ensureToggle();
          scheduleRestoreHighlights();
        } else {
          try { window.dwt?.rail?.remove?.('snip'); } catch (_) {}
        }
      }).catch(function () {
        if (S.enabled) {
          ensureToggle();
          scheduleRestoreHighlights();
        } else {
          try { window.dwt?.rail?.remove?.('snip'); } catch (_) {}
        }
      });
    } catch (_) {
      if (S.enabled) ensureToggle();
      else try { window.dwt?.rail?.remove?.('snip'); } catch (_) {}
    }
  }

  // live-boot / CDP 再 eval：刷新样式并恢复高亮；派发器已绑则只换 _handleUp
  if (dwt.selectionToolsModule && dwt.selectionToolsModule._ready) {
    dwt.selectionToolsModule.hotReload = hotReload;
    dwt.selectionToolsModule.restoreHighlights = restoreHighlights;
    dwt.selectionToolsModule.setEnabled = setEnabled;
    dwt.selectionToolsModule.scopeOf = scopeOf;
    dwt.selectionToolsModule.getSnippets = () => S.snippets.slice();
    dwt.selectionToolsModule._handleUp = onMouseUp;
    // 把手同理：面板还在，但监听绑在旧实例上（attach 幂等）
    let prevPanel = document.getElementById(PANEL_ID);
    if (prevPanel) {
      // clone 换掉节点以甩掉旧 addEventListener（只改 onclick 清不掉历史监听）
      const fresh = prevPanel.cloneNode(true);
      if (prevPanel.parentNode) prevPanel.parentNode.replaceChild(fresh, prevPanel);
      prevPanel = fresh;
      ensureTabs(prevPanel);
      ensureCloseBtn(prevPanel);
      bindPanel(prevPanel);
      window.dwt?.helpTip?.attach?.(prevPanel.querySelector('.dwt-snip-drag') || prevPanel.querySelector('.dwt-snip-head > span'), HELP);
      bindDrag(prevPanel);
      shieldHeadButtons(prevPanel);
      renderPanel();
    }
    // rail：hotReload 内按 storage 决定挂/卸，这里不抢先 ensureToggle
    hotReload();
    console.log('[cs][doubao-web-toolkit] selection-tools hot-reload (#84/#101)');
    return;
  }

  dwt.selectionToolsModule = {
    mount, setEnabled, getSnippets: () => S.snippets.slice(),
    restoreHighlights, hotReload, scopeOf, _ready: true,
    _handleUp: onMouseUp,
  };

  // Mount with defaults first — do not block #dwt-snip-toggle on hung storage (Glass→5179).
  mount();
  loadStore().then(function () {
    if (!S.enabled) setEnabled(false);
    else {
      ensureToggle();
      renderPanel();
      scheduleRestoreHighlights();
    }
  }).catch(function () {});
  console.log('[cs][doubao-web-toolkit] selection-tools ready (#84/#101)');
})();
