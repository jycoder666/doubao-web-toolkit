// context-lines/module.js — 选中英语后拆行并插入解释提示 (#96)
// 不录音、不请求听写接口；只处理页面里已经选中的英文。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_context_lines';
  const CARD_ID = 'dwt-ctx-card';
  const STYLE_ID = 'dwt-ctx-style';

  let enabled = false;

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
        position: fixed; z-index: 999991; max-width: 320px; background: #fff;
        border: 1px solid #d0d7de; border-radius: 10px; padding: 8px 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.14); font: 12px/1.45 system-ui, sans-serif; color: #1f2328;
      }
      #${CARD_ID} ol { margin: 6px 0; padding-left: 18px; }
      #${CARD_ID} button { margin-right: 6px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function insertPrompt(text) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) return false;
    const chunk = '请逐句解释下面这段英语，并列出关键词：\n' + text;
    pm.focus();
    const existing = (pm.innerText || '').trim();
    const next = existing ? existing + '\n' + chunk : chunk;
    const safe = next.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    pm.innerHTML = '<p dir="auto">' + safe.replace(/\n/g, '<br>') + '</p>';
    pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: chunk }));
    return true;
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
