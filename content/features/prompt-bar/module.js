// prompt-bar/module.js — 快捷回复（分组）: 输入框旁一个按钮, 滑出面板点选插入
//
// 交互: 底部右下只保留一个「💬 快捷回复」按钮; 鼠标滑过 / 点击 → 面板向上滑出,
//       按分组列出条目, 点条目把内容写进输入框; 点 ✎ 可就地增删分组与条目。
// 存储: dwt_prompts = JSON 字符串 {v:1, groups:[{name, items:[{label,value}]}]};
//       兼容历史平铺数组 [{label,value}] 与 [{group|name, items:[…]}]。
// 约束: 元素 id 必须是 dwt-prompt-bar —— dev/live-boot.js 与 dev/inject.js 的 uiReady 探针依赖它。
// 约束: 写输入框必须走 execCommand 链（同 context-lines）。直写 pm.innerHTML 会让
//       ProseMirror 的 state 与 DOM 失配, 抛 removeChild 崩掉整页。
(function () {
  'use strict';

  const dwt = (window.dwt = window.dwt || {});
  const KEY = 'dwt_prompts';
  const ROOT_ID = 'dwt-prompt-bar';
  const STYLE_ID = 'dwt-pb-style';
  const HINT_MS = 1400;
  const CLOSE_DELAY = 220; // 鼠标离开到收起之间留一拍, 免得擦边就闪掉

  const DEFAULT_GROUPS = [
    {
      name: '常用',
      items: [
        { label: '翻译英文', value: '请翻译成英文' },
        { label: '总结摘要', value: '请为上面的内容写一段 100 字的摘要' },
        { label: '改写优化', value: '请帮我改写这段话,让它更流畅专业' },
      ],
    },
    {
      name: '格式',
      items: [
        { label: 'JSON 格式', value: '请以严格的 JSON 格式输出,不要包含 markdown 代码块标记' },
      ],
    },
    {
      name: '追问',
      items: [
        { label: '继续展开', value: '请继续展开上面第 1 点,并给出具体例子' },
        { label: '举个例子', value: '请举一个具体、可执行的例子' },
      ],
    },
  ];

  // 重注入（live-boot / 扩展 reload）后 window.dwt 是新的, 但配置与编辑草稿要接着用。
  const S = (window.__dwtPromptBarState = window.__dwtPromptBarState || {
    groups: null, // null = 还没读存储, 先用默认渲染
    draft: null, // 编辑中的副本, 未保存时保留
    editing: false,
    open: false,
    pinned: false,
  });

  let hintTimer = null;
  let closeTimer = null;

  function cloneGroups(groups) {
    return (groups || []).map((g) => ({
      name: String(g.name || ''),
      items: (g.items || []).map((it) => ({ label: String(it.label || ''), value: String(it.value || '') })),
    }));
  }

  function normItem(it) {
    if (!it) return null;
    if (typeof it === 'string') {
      const s = it.trim();
      return s ? { label: s.slice(0, 24), value: s } : null;
    }
    const label = String(it.label || it.name || it.title || '').trim();
    const value = String(it.value !== undefined ? it.value : it.text || it.prompt || '').trim();
    if (!label && !value) return null;
    return { label: label || value.slice(0, 24), value: value || label };
  }

  // 三种写法统一成 {v:1, groups:[…]}: 旧平铺数组 / 分组数组 / 新版对象
  function normalize(raw) {
    const out = [];
    const pushGroup = (name, items) => {
      const list = (Array.isArray(items) ? items : []).map(normItem).filter(Boolean);
      if (list.length) out.push({ name: String(name || '未命名'), items: list });
    };
    if (Array.isArray(raw)) {
      if (raw.some((x) => x && Array.isArray(x.items))) raw.forEach((g) => pushGroup(g.group || g.name, g.items));
      else pushGroup('常用', raw);
    } else if (raw && Array.isArray(raw.groups)) {
      raw.groups.forEach((g) => pushGroup(g.name || g.group, g.items));
    }
    return out;
  }

  function hasShape(raw) {
    return Array.isArray(raw) || !!(raw && Array.isArray(raw.groups));
  }

  function activeGroups() {
    return S.groups || cloneGroups(DEFAULT_GROUPS);
  }

  function flatPrompts() {
    const out = [];
    activeGroups().forEach((g) => g.items.forEach((it) => out.push({ label: it.label, value: it.value, group: g.name })));
    return out;
  }

  // ---------- 样式（全部走 --dwt-* 变量, html.dwt-ui-dark 下自动深色） ----------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${ROOT_ID} {
        position: fixed; right: 56px; bottom: 12px; z-index: 999998;
        display: flex; flex-direction: column; align-items: flex-end;
        font: 12px/1.4 -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
        color: var(--dwt-fg, #1f2328);
      }
      #${ROOT_ID} * { box-sizing: border-box; }
      #${ROOT_ID} .dwt-pb-trigger {
        display: flex; align-items: center; gap: 5px;
        height: 36px; padding: 0 12px; border-radius: 18px; margin: 0;
        border: 1px solid var(--dwt-border, #d0d7de);
        background: var(--dwt-bg, #fff); color: var(--dwt-fg, #1f2328);
        box-shadow: 0 2px 10px rgba(0,0,0,.16);
        cursor: pointer; font: inherit; line-height: 1; white-space: nowrap;
      }
      #${ROOT_ID} .dwt-pb-trigger:hover,
      #${ROOT_ID}.dwt-open .dwt-pb-trigger {
        border-color: var(--dwt-accent, #2d72de); color: var(--dwt-accent, #2d72de);
      }
      #${ROOT_ID}.dwt-open .dwt-pb-trigger { background: var(--dwt-soft, #f6f8fa); }
      #${ROOT_ID} .dwt-pb-badge {
        min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px;
        background: var(--dwt-accent, #2d72de); color: #fff;
        font-size: 10px; line-height: 16px; text-align: center;
      }
      #${ROOT_ID} .dwt-pb-caret { font-size: 9px; opacity: .65; transition: transform .18s ease; }
      #${ROOT_ID}.dwt-open .dwt-pb-caret { transform: rotate(180deg); }
      #${ROOT_ID} .dwt-pb-panel {
        display: flex; flex-direction: column; width: min(320px, calc(100vw - 80px));
        max-height: 0; margin: 0; padding: 0;
        background: var(--dwt-bg, #fff); border: 1px solid transparent; border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,.18);
        opacity: 0; transform: translateY(6px); pointer-events: none; overflow: hidden;
        transition: max-height .22s ease, opacity .16s ease, transform .22s ease, margin .22s ease;
      }
      #${ROOT_ID} .dwt-pb-panel.dwt-editing { width: min(430px, calc(100vw - 80px)); }
      #${ROOT_ID}.dwt-open .dwt-pb-panel {
        max-height: min(62vh, 430px); opacity: 1; transform: none; pointer-events: auto;
        margin-bottom: 8px; border-color: var(--dwt-border, #d0d7de);
      }
      #${ROOT_ID} .dwt-pb-head {
        display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
        padding: 8px 10px 7px; border-bottom: 1px solid var(--dwt-border, #d0d7de);
      }
      #${ROOT_ID} .dwt-pb-title { flex: 1 1 auto; font-size: 11px; color: var(--dwt-muted, #8b949e); white-space: nowrap; }
      #${ROOT_ID} .dwt-pb-hint { font-size: 11px; color: var(--dwt-accent, #2d72de); white-space: nowrap; }
      #${ROOT_ID} .dwt-pb-hint.dwt-err { color: #d1242f; }
      #${ROOT_ID} .dwt-pb-btn {
        flex: 0 0 auto; height: 22px; padding: 0 7px; margin: 0; border-radius: 6px;
        border: 1px solid transparent; background: transparent; color: var(--dwt-muted, #8b949e);
        cursor: pointer; font: inherit; line-height: 1;
      }
      #${ROOT_ID} .dwt-pb-btn:hover { border-color: var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa); color: var(--dwt-accent, #2d72de); }
      #${ROOT_ID} .dwt-pb-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 6px 10px 8px; }
      #${ROOT_ID} .dwt-pb-group { margin-top: 6px; }
      #${ROOT_ID} .dwt-pb-group:first-child { margin-top: 0; }
      #${ROOT_ID} .dwt-pb-gname { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dwt-muted, #8b949e); margin-bottom: 5px; }
      #${ROOT_ID} .dwt-pb-gname::after { content: ''; flex: 1 1 auto; height: 1px; background: var(--dwt-border, #d0d7de); opacity: .7; }
      #${ROOT_ID} .dwt-pb-chips { display: flex; flex-wrap: wrap; gap: 5px; }
      #${ROOT_ID} .dwt-pb-chip {
        max-width: 100%; padding: 4px 9px; margin: 0; border-radius: 12px;
        border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa);
        color: var(--dwt-fg, #1f2328); cursor: pointer; font: inherit; font-size: 11.5px;
        line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #${ROOT_ID} .dwt-pb-chip:hover { border-color: var(--dwt-accent, #2d72de); color: var(--dwt-accent, #2d72de); background: var(--dwt-bg, #fff); }
      #${ROOT_ID} .dwt-pb-empty { padding: 10px 2px; font-size: 11px; color: var(--dwt-muted, #8b949e); }
      #${ROOT_ID} .dwt-pb-erow { display: flex; align-items: center; gap: 5px; margin: 4px 0; }
      #${ROOT_ID} .dwt-pb-in {
        min-width: 0; margin: 0; padding: 3px 6px; border-radius: 6px; font: inherit; font-size: 11.5px;
        border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa); color: var(--dwt-fg, #1f2328);
      }
      #${ROOT_ID} .dwt-pb-in:focus { outline: none; border-color: var(--dwt-accent, #2d72de); background: var(--dwt-bg, #fff); }
      #${ROOT_ID} .dwt-pb-in.dwt-name { flex: 0 0 88px; }
      #${ROOT_ID} .dwt-pb-in.dwt-val { flex: 1 1 auto; }
      #${ROOT_ID} .dwt-pb-in.dwt-groupname { flex: 1 1 auto; font-size: 12px; }
      #${ROOT_ID} .dwt-pb-egroup { padding: 6px 7px 7px; margin: 6px 0; border: 1px solid var(--dwt-border, #d0d7de); border-radius: 8px; }
      #${ROOT_ID} .dwt-pb-json { width: 100%; height: 116px; margin: 4px 0; padding: 5px 6px; border-radius: 6px; resize: vertical;
        border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa); color: var(--dwt-fg, #1f2328);
        font: 11px/1.45 ui-monospace, Menlo, Consolas, monospace; }
      #${ROOT_ID} .dwt-pb-foot {
        flex: 0 0 auto; display: flex; align-items: center; gap: 6px;
        padding: 7px 10px 9px; border-top: 1px solid var(--dwt-border, #d0d7de);
      }
      #${ROOT_ID} .dwt-pb-foot .dwt-pb-btn { height: 24px; padding: 0 9px; border-color: var(--dwt-border, #d0d7de); color: var(--dwt-fg, #1f2328); }
      #${ROOT_ID} .dwt-pb-foot .dwt-pb-btn.dwt-primary { border-color: var(--dwt-accent, #2d72de); color: var(--dwt-accent, #2d72de); }
      #${ROOT_ID} details > summary { cursor: pointer; font-size: 11px; color: var(--dwt-muted, #8b949e); outline: none; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function q(sel) {
    const root = document.getElementById(ROOT_ID);
    return root ? root.querySelector(sel) : null;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function btn(text, cls, onClick, title) {
    const b = el('button', 'dwt-pb-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
    return b;
  }

  function hint(msg, isErr) {
    const box = q('.dwt-pb-hint');
    if (!box) return;
    box.textContent = msg || '';
    box.classList.toggle('dwt-err', !!isErr);
    if (hintTimer) clearTimeout(hintTimer);
    if (msg) hintTimer = setTimeout(() => { const b = q('.dwt-pb-hint'); if (b) { b.textContent = ''; b.classList.remove('dwt-err'); } }, HINT_MS);
  }

  // ---------- 写进输入框（execCommand 链, 禁止 innerHTML 直写） ----------
  function composer() {
    try {
      const pm = dwt.selectorManager && dwt.selectorManager.getInput && dwt.selectorManager.getInput();
      if (pm) return pm;
    } catch (_) {}
    return document.querySelector('.ProseMirror') || document.querySelector('div[contenteditable="true"]');
  }

  function insertValue(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    const pm = composer();
    if (!pm) { hint('没找到输入框', true); return false; }
    pm.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(pm);
      sel.collapseToEnd();
      if ((pm.textContent || '').trim().length > 0) document.execCommand('insertParagraph');
      if (!document.execCommand('insertText', false, text)) throw new Error('execCommand rejected');
      hint('已插入 ✓');
      return true;
    } catch (_) {
      try {
        pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        hint('已插入 ✓');
        return true;
      } catch (_) { hint('插入失败', true); return false; }
    }
  }

  // ---------- 渲染 ----------
  function renderBody() {
    const body = q('.dwt-pb-body');
    if (!body) return;
    body.textContent = '';
    if (S.editing) renderEditor(body);
    else renderList(body);
  }

  function renderList(body) {
    const groups = activeGroups();
    if (!groups.length) {
      body.appendChild(el('div', 'dwt-pb-empty', '还没有快捷回复, 点右上角 ✎ 添加分组与条目'));
      return;
    }
    groups.forEach((g) => {
      const box = el('div', 'dwt-pb-group');
      box.appendChild(el('div', 'dwt-pb-gname', g.name));
      const chips = el('div', 'dwt-pb-chips');
      g.items.forEach((it) => {
        const b = el('button', 'dwt-pb-chip', it.label);
        b.type = 'button';
        b.title = it.value;
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); insertValue(it.value); });
        chips.appendChild(b);
      });
      box.appendChild(chips);
      body.appendChild(box);
    });
  }

  function renderEditor(body) {
    // 草稿一律是 { groups:[…] } 而不是裸数组: 早期写成裸数组时 d.groups 为 undefined,
    // forEach 抛错被 click 监听吞掉, 编辑区就渲染成一片空白（真机复现过一次）。
    if (!S.draft || !Array.isArray(S.draft.groups)) S.draft = { groups: cloneGroups(activeGroups()) };
    const d = S.draft;
    d.groups.forEach((g, gi) => {
      const box = el('div', 'dwt-pb-egroup');
      const head = el('div', 'dwt-pb-erow');
      const nameIn = el('input', 'dwt-pb-in dwt-groupname');
      nameIn.value = g.name;
      nameIn.placeholder = '分组名';
      nameIn.addEventListener('input', () => { g.name = nameIn.value; });
      head.appendChild(nameIn);
      head.appendChild(btn('🗑', '', () => { d.groups.splice(gi, 1); renderBody(); }, '删除分组'));
      box.appendChild(head);

      g.items.forEach((it, ii) => {
        const row = el('div', 'dwt-pb-erow');
        const lab = el('input', 'dwt-pb-in dwt-name');
        lab.value = it.label;
        lab.placeholder = '名称';
        lab.addEventListener('input', () => { it.label = lab.value; });
        const val = el('input', 'dwt-pb-in dwt-val');
        val.value = it.value;
        val.placeholder = '插入到输入框的内容';
        val.title = it.value;
        val.addEventListener('input', () => { it.value = val.value; val.title = val.value; });
        row.appendChild(lab);
        row.appendChild(val);
        row.appendChild(btn('🗑', '', () => { g.items.splice(ii, 1); renderBody(); }, '删除条目'));
        box.appendChild(row);
      });

      box.appendChild(btn('＋ 条目', '', () => { g.items.push({ label: '', value: '' }); renderBody(); }));
      body.appendChild(box);
    });
    body.appendChild(btn('＋ 分组', '', () => { d.groups.push({ name: '新分组', items: [] }); renderBody(); }));

    // JSON 批量编辑: 长 prompt 在窄输入框里改着费劲, 给一个整块导入导出
    const det = el('details');
    det.appendChild(el('summary', null, 'JSON 批量编辑'));
    const ta = el('textarea', 'dwt-pb-json');
    ta.placeholder = '{"v":1,"groups":[{"name":"常用","items":[{"label":"翻译英文","value":"请翻译成英文"}]}]}';
    ta.addEventListener('input', () => ta.classList.remove('dwt-err'));
    det.appendChild(ta);
    const bar = el('div', 'dwt-pb-erow');
    bar.appendChild(btn('导出文本', '', () => {
      ta.value = JSON.stringify({ v: 1, groups: d.groups }, null, 1);
      hint('已导出到文本框');
      try { navigator.clipboard && navigator.clipboard.writeText(ta.value); } catch (_) {}
    }));
    bar.appendChild(btn('从文本导入', '', () => {
      let parsed = null;
      try { parsed = JSON.parse(ta.value); } catch (_) { hint('JSON 解析失败', true); return; }
      const groups = normalize(parsed);
      if (!groups.length && !hasShape(parsed)) { hint('认不出的结构', true); return; }
      d.groups = groups;
      renderBody();
      hint('已导入 ' + groups.length + ' 组, 记得保存');
    }));
    det.appendChild(bar);
    body.appendChild(det);
  }

  function render() {
    injectStyles();
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.classList.toggle('dwt-open', !!S.open);
    const panel = root.querySelector('.dwt-pb-panel');
    if (panel) panel.classList.toggle('dwt-editing', !!S.editing);
    const title = root.querySelector('.dwt-pb-title');
    if (title) {
      title.textContent = S.editing
        ? '编辑快捷回复（保存后生效）'
        : '快捷回复 · ' + flatPrompts().length + ' 条';
    }
    const badge = root.querySelector('.dwt-pb-badge');
    if (badge) badge.textContent = String(flatPrompts().length);
    const editBtn = root.querySelector('.dwt-pb-edit');
    if (editBtn) editBtn.textContent = S.editing ? '✓' : '✎';
    const foot = root.querySelector('.dwt-pb-foot');
    if (foot) foot.style.display = S.editing ? 'flex' : 'none';
    const trig = root.querySelector('.dwt-pb-trigger');
    if (trig) trig.setAttribute('aria-expanded', S.open ? 'true' : 'false');
    renderBody();
  }

  // ---------- 展开/收起 ----------
  function setOpen(v) {
    S.open = !!v;
    if (!S.open) S.pinned = false;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    const root = document.getElementById(ROOT_ID);
    if (root) root.classList.toggle('dwt-open', S.open);
    const trig = root && root.querySelector('.dwt-pb-trigger');
    if (trig) trig.setAttribute('aria-expanded', S.open ? 'true' : 'false');
  }

  function scheduleClose() {
    if (S.pinned) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!S.pinned) setOpen(false); }, CLOSE_DELAY);
  }

  function save() {
    const groups = cloneGroups((S.draft && S.draft.groups) || activeGroups())
      .map((g) => ({ name: g.name.trim() || '未命名', items: g.items.filter((it) => it.label.trim() || it.value.trim()) }))
      .filter((g) => g.items.length);
    S.groups = groups;
    S.draft = null;
    S.editing = false;
    try {
      const p = chrome.storage.local.set({ [KEY]: JSON.stringify({ v: 1, groups }) });
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
    render();
    hint('已保存 ✓');
  }

  function setGroups(raw, persist) {
    const groups = normalize(raw);
    if (!groups.length && !hasShape(raw)) return false;
    S.groups = groups;
    S.draft = null;
    S.editing = false;
    if (persist !== false) {
      try {
        const p = chrome.storage.local.set({ [KEY]: JSON.stringify({ v: 1, groups }) });
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    }
    render();
    return true;
  }

  function mount() {
    injectStyles();
    const old = document.getElementById(ROOT_ID);
    if (old) old.remove(); // 重注入时重建, 让事件监听绑到当前闭包（配置在 S 里, 不丢）
    const root = el('div');
    root.id = ROOT_ID;

    const panel = el('div', 'dwt-pb-panel');
    const head = el('div', 'dwt-pb-head');
    head.appendChild(el('div', 'dwt-pb-title', '快捷回复'));
    head.appendChild(el('div', 'dwt-pb-hint', ''));
    head.appendChild(btn('✎', 'dwt-pb-edit', () => {
      S.editing = !S.editing;
      if (S.editing) S.draft = { groups: cloneGroups(activeGroups()) };
      else S.draft = null;
      render();
    }, '编辑分组与条目'));
    head.appendChild(btn('✕', '', () => setOpen(false), '收起'));
    panel.appendChild(head);

    const body = el('div', 'dwt-pb-body');
    panel.appendChild(body);

    const foot = el('div', 'dwt-pb-foot');
    foot.style.display = 'none';
    foot.appendChild(btn('保存', 'dwt-primary', save, '写入 dwt_prompts'));
    foot.appendChild(btn('取消', '', () => { S.draft = null; S.editing = false; render(); }));
    foot.appendChild(btn('恢复默认', '', () => {
      S.draft = { groups: cloneGroups(DEFAULT_GROUPS) };
      renderBody();
      hint('已载入默认, 点保存生效');
    }));
    panel.appendChild(foot);
    root.appendChild(panel);

    const trig = el('button', 'dwt-pb-trigger');
    trig.type = 'button';
    trig.title = '快捷回复: 鼠标滑过或点击展开';
    trig.appendChild(el('span', null, '💬'));
    trig.appendChild(el('span', null, '快捷回复'));
    trig.appendChild(el('span', 'dwt-pb-badge', String(flatPrompts().length)));
    trig.appendChild(el('span', 'dwt-pb-caret', '▴'));
    trig.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (S.pinned && S.open) setOpen(false);
      else { S.pinned = true; setOpen(true); }
    });
    root.appendChild(trig);

    root.addEventListener('mouseenter', () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } setOpen(true); });
    root.addEventListener('mouseleave', scheduleClose);
    // 面板内部点击不要冒泡到页面（豆包页有全局快捷键/收起逻辑）
    root.addEventListener('click', (e) => e.stopPropagation());

    (document.body || document.documentElement).appendChild(root);

    if (!window.__dwtPromptBarDoc) {
      window.__dwtPromptBarDoc = true;
      document.addEventListener('click', (e) => {
        const r = document.getElementById(ROOT_ID);
        if (r && e.target && r.contains(e.target)) return;
        if (S.open) setOpen(false);
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !S.open) return;
        if (S.editing) { S.editing = false; S.draft = null; render(); }
        else setOpen(false);
      }, true);
    }

    S.open = false;
    S.pinned = false;
    render();
  }

  async function load() {
    let raw;
    try {
      const r = await chrome.storage.local.get(KEY);
      raw = r ? r[KEY] : null;
    } catch (_) { return; }
    if (raw == null) return; // 没配过 → 保留默认
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch (_) { return; }
    }
    const groups = normalize(parsed);
    if (!groups.length && !hasShape(parsed)) return;
    S.groups = groups;
    render();
  }

  dwt.promptBarModule = {
    mount,
    load,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!S.open),
    isOpen: () => !!S.open,
    getPrompts: () => flatPrompts(), // 兼容旧 API: 平铺列表
    getGroups: () => cloneGroups(activeGroups()),
    setGroups,
    reset: () => setGroups(DEFAULT_GROUPS),
    KEY,
  };

  // 先用默认渲染, 不等存储（存储桥偶发挂起时 UI 也必须出来）
  mount();
  load().then(() => render()).catch(() => {});
  console.log('[cs][doubao-web-toolkit] prompt-bar module ready (grouped)');
})();
