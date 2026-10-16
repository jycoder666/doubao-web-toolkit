// arxiv-prompt/module.js — 把 arXiv 编号/链接写成解读提示插入输入框 (#105)
// 不抓取论文、不调用 arXiv API。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_arxiv_prompt';
  const ROOT_ID = 'dwt-arxiv-root';
  const STYLE_ID = 'dwt-arxiv-style';

  let enabled = false;

  function normalize(raw) {
    const s = (raw || '').trim();
    const id = s.match(/(\d{4}\.\d{4,5})(v\d+)?/);
    if (id) return 'https://arxiv.org/abs/' + id[1] + (id[2] || '');
    if (/^https?:\/\/(arxiv\.org|ar5iv\.labs\.arxiv\.org)\//i.test(s)) return s;
    return '';
  }

  function insertPrompt(url) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) return false;
    const chunk = '请用中文解读这篇 arXiv 论文：' + url + '\n包括：要解决的问题、方法、主要结果、局限。';
    pm.focus();
    const existing = (pm.innerText || '').trim();
    const next = existing ? existing + '\n' + chunk : chunk;
    const safe = next.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    pm.innerHTML = '<p dir="auto">' + safe.replace(/\n/g, '<br>') + '</p>';
    pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: chunk }));
    return true;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${ROOT_ID} {
        position: fixed; right: 16px; bottom: 248px; z-index: 999990;
        background: #fff; border: 1px solid #d0d7de; border-radius: 10px;
        box-shadow: 0 6px 18px rgba(0,0,0,.1); padding: 8px; font: 12px system-ui, sans-serif;
        display: flex; gap: 6px; align-items: center;
      }
      #${ROOT_ID} input { width: 180px; border: 1px solid #d0d7de; border-radius: 6px; padding: 4px 6px; }
      #${ROOT_ID} button { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; }
      #${ROOT_ID} .err { color: #cf222e; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<span>arXiv</span><input id="dwt-arxiv-in" placeholder="2401.12345 或链接"><button type="button" id="dwt-arxiv-go">插入解读</button><span class="err" id="dwt-arxiv-err"></span>';
    document.body.appendChild(root);
    root.querySelector('#dwt-arxiv-go').addEventListener('click', () => {
      const err = root.querySelector('#dwt-arxiv-err');
      const url = normalize(root.querySelector('#dwt-arxiv-in').value);
      if (!url) { err.textContent = '无法识别'; return; }
      err.textContent = insertPrompt(url) ? '' : '无输入框';
    });
  }

  function apply() {
    if (!enabled) {
      document.getElementById(ROOT_ID)?.remove();
      return;
    }
    mount();
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(FEAT_KEY);
      enabled = r[FEAT_KEY] === true;
    } catch (_) { enabled = false; }
    apply();
  }

  dwt.arxivPromptModule = {
    setEnabled(v) { enabled = !!v; apply(); },
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] arxiv-prompt ready (#105)');
})();
