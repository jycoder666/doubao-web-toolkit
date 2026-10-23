// float-panel/module.js — 可拖拽缩放悬浮便签 (#86 Superseed 页内精简)
// 不在全站 iframe 嵌豆包（本扩展仅匹配 doubao.com，且页内再嵌自身无意义）；
// 落地：可拖拽/缩放本地便签 + Ctrl+Shift+H 显隐，位置尺寸持久化。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_float_panel';
  const NOTE_KEY = 'dwt_float_note';
  const GEOM_KEY = 'dwt_float_geom';
  const ROOT_ID = 'dwt-float-root';
  const STYLE_ID = 'dwt-float-style';

  let enabled = false;
  let visible = true;
  let note = '';
  let geom = { left: 24, top: 120, width: 280, height: 220 };

  // ⓘ 用法说明：面板标题右侧与 rail 菜单行标题右侧共用同一份
  const HELP = {
    title: '📄 悬浮便签',
    desc: '一块跟着页面走的本地草稿板：写提示词草稿、临时贴素材，不联网。',
    rows: [
      ['开关', 'Ctrl+Shift+H，或点工具栏 📄（焦点在输入框里时不劫持快捷键）'],
      ['保存', '边打边存（停手 400ms 落盘 chrome.storage），关页不丢'],
      ['挪位置', '按住标题「便签 · Ctrl+Shift+H」拖动'],
      ['改大小', '拖右下角'],
      ['收起', '标题右侧 −（只是隐藏，内容还在）'],
    ],
    note: '内容只存本机，不随对话走、不上传；清空请直接全选删掉。',
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${ROOT_ID} {
        position: fixed; z-index: 999995; display: flex; flex-direction: column;
        background: var(--dwt-bg, rgba(255,255,255,.97)); border: 1px solid var(--dwt-border, #d0d7de);
        border-radius: 10px;
        box-shadow: 0 10px 32px rgba(0,0,0,.16); overflow: hidden; min-width: 160px; min-height: 120px;
        font-family: system-ui, sans-serif; color: var(--dwt-fg, #1f2328);
      }
      #${ROOT_ID} .dwt-fp-head {
        height: 28px; background: var(--dwt-soft, #eef1f4); cursor: move; display: flex;
        align-items: center; justify-content: space-between; padding: 0 8px;
        font-size: 12px; font-weight: 600; user-select: none;
      }
      #${ROOT_ID} .dwt-fp-head button {
        border: none; background: transparent; cursor: pointer; font-size: 14px;
        color: var(--dwt-muted, #57606a);
      }
      #${ROOT_ID} textarea {
        flex: 1; border: none; resize: none; padding: 8px; font-size: 12px;
        outline: none; background: transparent; line-height: 1.45;
      }
      #${ROOT_ID} .dwt-fp-resize {
        position: absolute; right: 0; bottom: 0; width: 14px; height: 14px;
        cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #9aa4b2 50%);
      }
      #${ROOT_ID} .dwt-fp-foot {
        font-size: 10px; color: var(--dwt-muted, #8b949e); padding: 2px 8px 4px;
        border-top: 1px solid var(--dwt-soft, #eef1f4);
      }
    `;
    document.head.appendChild(st);
  }

  function clampGeom(g) {
    const w = Math.max(160, Math.min(g.width || 280, window.innerWidth - 20));
    const h = Math.max(120, Math.min(g.height || 220, window.innerHeight - 20));
    const left = Math.max(0, Math.min(g.left || 0, window.innerWidth - w));
    const top = Math.max(0, Math.min(g.top || 0, window.innerHeight - h));
    return { left, top, width: w, height: h };
  }

  function persistGeom() {
    try { chrome.storage.local.set({ [GEOM_KEY]: geom }); } catch (_) {}
  }

  function persistNote() {
    try { chrome.storage.local.set({ [NOTE_KEY]: note }); } catch (_) {}
  }

  function applyGeom(el) {
    geom = clampGeom(geom);
    el.style.left = geom.left + 'px';
    el.style.top = geom.top + 'px';
    el.style.width = geom.width + 'px';
    el.style.height = geom.height + 'px';
  }

  function bindDrag(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, moving = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      moving = true;
      sx = e.clientX; sy = e.clientY;
      ox = geom.left; oy = geom.top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!moving) return;
      geom.left = ox + (e.clientX - sx);
      geom.top = oy + (e.clientY - sy);
      applyGeom(el);
    });
    window.addEventListener('mouseup', () => {
      if (!moving) return;
      moving = false;
      persistGeom();
    });
  }

  function bindResize(el, handle) {
    let sx = 0, sy = 0, ow = 0, oh = 0, resizing = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      resizing = true;
      sx = e.clientX; sy = e.clientY;
      ow = geom.width; oh = geom.height;
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      geom.width = ow + (e.clientX - sx);
      geom.height = oh + (e.clientY - sy);
      applyGeom(el);
    });
    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;
      persistGeom();
    });
  }

  // 「−」必须用 title/class 直取：helpTip 会在标题 span 内插入 ⓘ，
  // querySelector('.dwt-fp-head button') 会误绑到 ⓘ（点击 − 无反应）。
  function wireHide(root) {
    const hideBtn = root.querySelector('.dwt-fp-head > button.dwt-fp-hide')
      || root.querySelector('.dwt-fp-head > button[title="隐藏"]');
    if (!hideBtn) return;
    if (hideBtn.__dwtHideBound) {
      try { hideBtn.removeEventListener('click', hideBtn.__dwtHideBound); } catch (_) {}
    }
    const onHide = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setVisible(false);
    };
    hideBtn.__dwtHideBound = onHide;
    hideBtn.addEventListener('click', onHide);
  }

  function mount() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      // 热注入早退：DOM 已在，但新闭包须重绑 hide（旧实例可能绑错了 ⓘ）
      const span = existing.querySelector('.dwt-fp-head span');
      if (span) {
        // 拆掉旧 ⓘ（可能带着误绑的 hide 监听），再挂干净的说明钮
        try { window.dwt?.helpTip?.detach?.(span); } catch (_) {}
        try { window.dwt?.helpTip?.attach?.(span, HELP); } catch (_) {}
      }
      const hideBtn = existing.querySelector('.dwt-fp-head > button[title="隐藏"]');
      if (hideBtn) hideBtn.classList.add('dwt-fp-hide');
      wireHide(existing);
      applyGeom(existing);
      existing.style.display = visible ? 'flex' : 'none';
      return;
    }
    injectStyles();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="dwt-fp-head">
        <span>便签 · Ctrl+Shift+H</span>
        <button type="button" class="dwt-fp-hide" title="隐藏">−</button>
      </div>
      <textarea placeholder="临时草稿，仅存本机…"></textarea>
      <div class="dwt-fp-foot">不联网 · 拖拽标题移动 · 右下角缩放</div>
      <div class="dwt-fp-resize"></div>
    `;
    document.documentElement.appendChild(root);
    applyGeom(root);
    root.style.display = visible ? 'flex' : 'none';

    const head = root.querySelector('.dwt-fp-head');
    // 先绑 hide，再挂 ⓘ（ⓘ 插进 span，不能用泛查询 button）
    wireHide(root);
    // 标题右侧 ⓘ：悬停出表格化说明（rail 菜单行标题右侧共用同一份 HELP）
    window.dwt?.helpTip?.attach?.(head.querySelector('span'), HELP);
    const ta = root.querySelector('textarea');
    const resize = root.querySelector('.dwt-fp-resize');

    ta.value = note;
    let saveTimer = null;
    ta.addEventListener('input', () => {
      note = ta.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persistNote, 400);
    });
    bindDrag(root, head);
    bindResize(root, resize);
  }

  function unmount() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    try { window.dwt?.rail?.remove?.('float'); } catch (_) {}
  }

  function setVisible(v) {
    visible = !!v;
    const el = document.getElementById(ROOT_ID);
    if (el) el.style.display = visible ? 'flex' : 'none';
    window.dwt?.rail?.setActive?.('float', visible);
  }

  function onKey(e) {
    if (!enabled) return;
    if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/i.test(tag) || e.target?.isContentEditable) return;
      e.preventDefault();
      setVisible(!visible);
    }
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get([FEAT_KEY, NOTE_KEY, GEOM_KEY]);
      enabled = r[FEAT_KEY] === true;
      if (typeof r[NOTE_KEY] === 'string') note = r[NOTE_KEY];
      if (r[GEOM_KEY] && typeof r[GEOM_KEY] === 'object') geom = { ...geom, ...r[GEOM_KEY] };
    } catch (_) { enabled = false; }
    if (enabled) { mountRail(); mount(); setVisible(true); }
    else unmount();
  }

  // 统一工具栏入口 (原仅 Ctrl+Shift+H)
  function mountRail() {
    try { window.dwt?.rail?.remove?.('float'); } catch (_) {}
    window.dwt?.rail?.add?.({
      id: 'float',
      icon: '📄',
      title: '悬浮便签 (Ctrl+Shift+H)',
      order: 48,
      onClick: () => {
        if (!enabled) dwt.floatPanelModule.setEnabled(true);
        else setVisible(!visible);
      },
    });
  }

  window.addEventListener('keydown', onKey, true);

  dwt.floatPanelModule = {
    setEnabled(v) {
      enabled = !!v;
      if (enabled) { mountRail(); mount(); setVisible(true); }
      else unmount();
    },
    isEnabled: () => enabled,
    toggleVisible() { setVisible(!visible); },
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] float-panel ready (#86)');
})();
