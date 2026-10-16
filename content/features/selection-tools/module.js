// selection-tools/module.js — 划词语料收藏 + 文字高亮 + LaTeX 快捷复制
// 对应总表: #101 d-picot（划词收藏）、#84 Better_Doubao（语料板 / 高亮 / LaTeX）
// 侧栏收纳放弃（易与豆包原生 UI 冲突）；文件夹仍见 conversation-manager
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

  let enabled = true;
  let snippets = [];
  let highlights = {}; // { [chatId]: [{ hash, text, color }] }
  let barHideTimer = null;

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
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${BAR_ID} {
        position: fixed; z-index: 999999; display: none; gap: 4px;
        padding: 4px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.14); font-size: 12px;
      }
      #${BAR_ID} button {
        border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px;
        padding: 4px 8px; cursor: pointer; font-size: 12px; color: #1f2328;
      }
      #${BAR_ID} button:hover { background: #e8f0ff; border-color: #2d72de; color: #2d72de; }
      #${TOGGLE_ID} {
        position: fixed; right: 12px; bottom: 108px; z-index: 999997;
        width: 36px; height: 36px; border-radius: 50%; border: none;
        background: #2d72de; color: #fff; cursor: pointer; font-size: 16px;
        box-shadow: 0 2px 10px rgba(45,114,222,.35);
      }
      #${PANEL_ID} {
        position: fixed; right: 12px; bottom: 152px; z-index: 999997;
        width: 260px; max-height: 50vh; overflow: auto; display: none;
        background: rgba(255,255,255,.98); border: 1px solid #d0d7de; border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,.14); padding: 10px; font-size: 12px; color: #1f2328;
      }
      #${PANEL_ID} .dwt-snip-head {
        display:flex; justify-content:space-between; align-items:center;
        font-weight:600; margin-bottom:8px;
      }
      #${PANEL_ID} .dwt-snip-item {
        border: 1px solid #eef1f4; border-radius: 8px; padding: 6px 8px; margin-bottom: 6px;
        cursor: pointer; line-height: 1.4;
      }
      #${PANEL_ID} .dwt-snip-item:hover { background: #f0f4ff; border-color: #c9d8ff; }
      #${PANEL_ID} .dwt-snip-meta { color: #8b949e; font-size: 10px; margin-top: 4px; }
      #${PANEL_ID} .dwt-snip-actions { display:flex; gap:4px; margin-top:8px; }
      #${PANEL_ID} .dwt-snip-actions button {
        flex:1; border:1px solid #d0d7de; background:#fff; border-radius:6px;
        padding:4px; cursor:pointer; font-size:11px;
      }
      mark.dwt-hl { background: #ffe58f; color: inherit; border-radius: 2px; padding: 0 1px; }
      mark.dwt-hl-green { background: #b7eb8f; }
      mark.dwt-hl-cyan { background: #87e8de; }
      mark.dwt-hl-pink { background: #ffadd2; }
      .dwt-latex-btn {
        margin-left: 4px; font-size: 11px; padding: 0 4px; border-radius: 4px;
        border: 1px solid #d0d7de; background: #fff; cursor: pointer; color: #57606a;
        vertical-align: middle;
      }
      .dwt-latex-btn:hover { color: #2d72de; border-color: #2d72de; }
    `;
    document.head.appendChild(st);
  }

  async function loadStore() {
    try {
      const r = await chrome.storage.local.get([SNIP_KEY, HL_KEY, FEAT_KEY]);
      if (r[FEAT_KEY] === false) enabled = false;
      snippets = Array.isArray(r[SNIP_KEY]) ? r[SNIP_KEY] : [];
      highlights = r[HL_KEY] && typeof r[HL_KEY] === 'object' ? r[HL_KEY] : {};
    } catch (_) { /* mock / 无 storage */ }
  }

  async function saveSnippets() {
    try { await chrome.storage.local.set({ [SNIP_KEY]: snippets.slice(0, 200) }); } catch (_) {}
  }

  async function saveHighlights() {
    try { await chrome.storage.local.set({ [HL_KEY]: highlights }); } catch (_) {}
  }

  function getSelectionText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    return (sel.toString() || '').trim();
  }

  function insertIntoInput(text) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) { alert('输入框未找到'); return false; }
    pm.focus();
    const existing = (pm.innerText || '').trim();
    const chunk = '[' + text + ']';
    const next = existing ? existing + '\n' + chunk : chunk;
    pm.innerHTML = '<p dir="auto">' + escapeHtml(next).replace(/\n/g, '<br>') + '</p>';
    pm.dispatchEvent(new InputEvent('input', { data: chunk, inputType: 'insertText', bubbles: true }));
    pm.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function showBar(x, y) {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    bar.style.display = 'flex';
    const pad = 8;
    const left = Math.min(window.innerWidth - 200, Math.max(pad, x));
    const top = Math.min(window.innerHeight - 48, Math.max(pad, y));
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
    if (barHideTimer) clearTimeout(barHideTimer);
    barHideTimer = setTimeout(hideBar, 8000);
  }

  function hideBar() {
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.style.display = 'none';
  }

  function ensureBar() {
    if (document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML =
      '<button type="button" data-act="snip">📌 收藏</button>'
      + '<button type="button" data-act="hl">🖍 高亮</button>'
      + '<button type="button" data-act="copy">复制</button>';
    bar.addEventListener('mousedown', (e) => e.preventDefault()); // 保住选区
    bar.addEventListener('click', onBarClick);
    document.body.appendChild(bar);
  }

  async function onBarClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const text = getSelectionText();
    if (!text) { hideBar(); return; }
    const act = btn.dataset.act;
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(text); } catch (_) {}
      hideBar();
      return;
    }
    if (act === 'snip') {
      snippets.unshift({
        id: Date.now().toString(36),
        text: text.slice(0, 2000),
        chatId: chatId(),
        at: Date.now(),
      });
      await saveSnippets();
      renderPanel();
      hideBar();
      return;
    }
    if (act === 'hl') {
      applyHighlight(text, 'dwt-hl');
      const id = chatId();
      if (!highlights[id]) highlights[id] = [];
      const h = hashText(text);
      if (!highlights[id].some((x) => x.hash === h)) {
        highlights[id].push({ hash: h, text: text.slice(0, 500), color: 'dwt-hl' });
        await saveHighlights();
      }
      hideBar();
    }
  }

  function applyHighlight(text, colorClass) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    try {
      const range = sel.getRangeAt(0);
      const mark = document.createElement('mark');
      mark.className = colorClass || 'dwt-hl';
      mark.dataset.dwtHl = '1';
      range.surroundContents(mark);
      sel.removeAllRanges();
    } catch (_) {
      // 跨复杂节点时 surroundContents 可能失败，忽略
    }
  }

  function ensurePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<div class="dwt-snip-head"><span>📌 语料板</span><span id="dwt-snip-count" style="color:#8b949e;font-weight:400;"></span></div>'
      + '<div id="dwt-snip-list"></div>'
      + '<div class="dwt-snip-actions">'
      + '<button type="button" id="dwt-snip-export">导出</button>'
      + '<button type="button" id="dwt-snip-clear">清空</button>'
      + '</div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      const item = e.target.closest('.dwt-snip-item');
      if (item && item.dataset.text) {
        insertIntoInput(item.dataset.text);
        return;
      }
    });
    panel.querySelector('#dwt-snip-export').addEventListener('click', () => {
      const md = snippets.map((s, i) => (i + 1) + '. ' + s.text).join('\n\n');
      const blob = new Blob([md || '(空)'], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dwt-snippets.md';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    panel.querySelector('#dwt-snip-clear').addEventListener('click', async () => {
      if (!confirm('清空全部语料？')) return;
      snippets = [];
      await saveSnippets();
      renderPanel();
    });
  }

  function renderPanel() {
    const list = document.getElementById('dwt-snip-list');
    const count = document.getElementById('dwt-snip-count');
    if (!list) return;
    if (count) count.textContent = '共 ' + snippets.length + ' 条';
    if (!snippets.length) {
      list.innerHTML = '<div style="color:#8b949e;text-align:center;padding:12px;">选中文字 → 📌 收藏</div>';
      return;
    }
    list.innerHTML = snippets.map((s) =>
      '<div class="dwt-snip-item" data-text="' + escapeHtml(s.text) + '">'
      + escapeHtml(s.text.slice(0, 120)) + (s.text.length > 120 ? '…' : '')
      + '<div class="dwt-snip-meta">' + new Date(s.at || Date.now()).toLocaleString() + '</div>'
      + '</div>'
    ).join('');
  }

  function ensureToggle() {
    if (document.getElementById(TOGGLE_ID)) return;
    const btn = document.createElement('button');
    btn.id = TOGGLE_ID;
    btn.type = 'button';
    btn.title = '语料板（划词收藏）';
    btn.textContent = '📌';
    btn.addEventListener('click', () => {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      const open = panel.style.display === 'block';
      panel.style.display = open ? 'none' : 'block';
      if (!open) renderPanel();
    });
    document.body.appendChild(btn);
  }

  function onMouseUp(e) {
    if (!enabled) return;
    if (e.target.closest('#' + BAR_ID) || e.target.closest('#' + PANEL_ID)) return;
    const text = getSelectionText();
    if (text.length < 2) { hideBar(); return; }
    // 避免在输入框内弹出
    if (e.target.closest('.ProseMirror') || e.target.closest('[contenteditable="true"]')) {
      hideBar();
      return;
    }
    showBar(e.clientX + 8, e.clientY + 8);
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
    enabled = !!v;
    const toggle = document.getElementById(TOGGLE_ID);
    const panel = document.getElementById(PANEL_ID);
    if (toggle) toggle.style.display = enabled ? '' : 'none';
    if (!enabled) {
      hideBar();
      if (panel) panel.style.display = 'none';
    }
  }

  function mount() {
    if (!enabled) return;
    injectStyles();
    ensureBar();
    ensurePanel();
    ensureToggle();
    renderPanel();
    document.addEventListener('mouseup', onMouseUp, true);
    bindLatex();
    setInterval(bindLatex, 3000);
  }

  dwt.selectionToolsModule = {
    mount, setEnabled, getSnippets: () => snippets.slice(),
  };

  loadStore().then(mount);
  console.log('[cs][doubao-web-toolkit] selection-tools ready (#84/#101)');
})();
