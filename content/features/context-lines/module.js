// context-lines/module.js — 选中英语后拆行并插入解释提示 (#96)
// 不录音、不请求听写接口；只处理页面里已经选中的英文。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_context_lines';
  const CARD_ID = 'dwt-ctx-card';
  const STYLE_ID = 'dwt-ctx-style';

  let enabled = false;

  // ⓘ 用法说明：卡片标题右侧（rail 无本模块入口，只挂在卡片标题上）
  const HELP = {
    title: '✂️ 英文分行',
    desc: '选中一段英文 → 按 8 词一行拆开，方便逐行读 / 逐行喂给翻译。',
    rows: [
      ['怎么用', '选中英文（≥4 词、字母占比 >60%）→ 松开鼠标即出卡片'],
      ['插入解释提示', '把「请逐句解释下面这段英语，并列出关键词：」+ 原文插进输入框（只填不发）'],
      ['关闭', '点「关闭」或再点别处；卡片不写页面内容，只读你选中的那段'],
      ['挪位置', '按住卡片标题拖动'],
    ],
    note: '纯本地按空格切词，不请求翻译 / 听写接口，不改你选中的原文。',
  };

  function looksEnglish(text) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 4) return false;
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return letters / Math.max(text.length, 1) > 0.6;
  }

  function toLines(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    for (let i = 0; i < words.length; i += 8) lines.push(words.slice(i, i + 8).join(' '));
    return lines;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${CARD_ID} {
        position: fixed; z-index: 999991; max-width: 320px; background: var(--dwt-bg, #fff);
        border: 1px solid #d0d7de; border-radius: 10px; padding: 8px 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.14); font: 12px/1.45 system-ui, sans-serif; color: #1f2328;
      }
      #${CARD_ID} ol { margin: 6px 0; padding-left: 18px; }
      #${CARD_ID} button { margin-right: 6px; border: 1px solid var(--dwt-border, #d0d7de);
        background: var(--dwt-soft, #f6f8fa); color: var(--dwt-fg, #1f2328); border-radius: 6px; cursor: pointer; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function insertPrompt(text) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) return false;
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    const chunk = '请逐句解释下面这段英语，并列出关键词：' + flat;
    // 禁止 pm.innerHTML 直写：ProseMirror state 与 DOM 失配会抛 removeChild 崩整页。
    // 必须走输入事件链 (execCommand → input), 让 PM 自己记账。
    pm.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(pm);
      sel.collapseToEnd();
      const hasText = (pm.textContent || '').trim().length > 0;
      if (hasText) document.execCommand('insertParagraph');
      if (!document.execCommand('insertText', false, chunk)) throw new Error('execCommand rejected');
      return true;
    } catch (_) {
      try {
        pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: chunk }));
        pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: chunk }));
        return true;
      } catch (_) { return false; }
    }
  }

  function showCard(text, x, y) {
    injectStyles();
    let card = document.getElementById(CARD_ID);
    if (!card) {
      card = document.createElement('div');
      card.id = CARD_ID;
      document.body.appendChild(card);
    }
    const lines = toLines(text);
    card.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = '英语 ' + text.split(/\s+/).length + ' 词 · ' + lines.length + ' 行';
    // 标题右侧 ⓘ：悬停出表格化说明（卡片每次展示都重建，所以每次都要挂；attach 幂等）
    window.dwt?.helpTip?.attach?.(title, HELP);
    card.appendChild(title);
    const ol = document.createElement('ol');
    lines.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      ol.appendChild(li);
    });
    card.appendChild(ol);
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = '插入解释提示';
    go.addEventListener('click', () => { insertPrompt(text); card.remove(); });
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    close.addEventListener('click', () => card.remove());
    card.appendChild(go);
    card.appendChild(close);
    card.style.left = Math.min(window.innerWidth - 330, Math.max(8, x)) + 'px';
    card.style.top = Math.min(window.innerHeight - 160, Math.max(8, y + 12)) + 'px';
    // 拖拽：标题行为把手。卡片每次展示都会重建子节点，所以把手要跟着重挂（attach 幂等）
    window.dwt?.drag?.attach?.(card, { key: 'ctx', handle: card.firstElementChild });
  }

  function onUp(e) {
    if (!enabled) return;
    if (e.target.closest && e.target.closest('#' + CARD_ID)) return;
    const text = (window.getSelection()?.toString() || '').trim();
    if (!looksEnglish(text)) return;
    showCard(text, e.clientX || 40, e.clientY || 40);
  }

  function apply() {
    document.removeEventListener('mouseup', onUp, true);
    if (!enabled) {
      document.getElementById(CARD_ID)?.remove();
      return;
    }
    document.addEventListener('mouseup', onUp, true);
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(FEAT_KEY);
      enabled = r[FEAT_KEY] === true;
    } catch (_) { enabled = false; }
    apply();
  }

  dwt.contextLinesModule = {
    setEnabled(v) { enabled = !!v; apply(); },
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] context-lines ready (#96)');
})();
