// page-comfort/module.js — 宽屏 + 长回复折叠 (#87 doubao-pp / Deepseek-pp 页内精简)
// 只改布局与折叠按钮，不拦截请求、不改模型参数。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_page_comfort';
  const WIDE_KEY = 'dwt_page_comfort_wide';
  const STYLE_ID = 'dwt-comfort-style';
  const BTN_ID = 'dwt-comfort-wide';
  const FOLD_LIMIT = 220;

  let enabled = false;
  let wide = false;
  let observer = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${BTN_ID} {
        position: fixed; right: 16px; bottom: 210px; z-index: 999990;
        border: 1px solid #d0d7de; background: #fff; border-radius: 8px;
        padding: 6px 10px; font-size: 12px; cursor: pointer; color: #1f2328;
        box-shadow: 0 4px 14px rgba(0,0,0,.08);
      }
      html.dwt-comfort-wide main, html.dwt-comfort-wide .chat,
      html.dwt-comfort-wide .v_list_scroller { max-width: none !important; width: auto !important; }
      .dwt-comfort-folded { max-height: 7.2em; overflow: hidden; }
      .dwt-fold-btn {
        display: inline-block; margin-top: 6px; border: none; background: #eef1f4;
        border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer; color: #0969da;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function messageNodes() {
    return document.querySelectorAll(
      '.conversation-message-content-padding-right, [class*="message-content"], .ai'
    );
  }

  function ensureFold(node) {
    if (!node || node.dataset.dwtComfort === '1') return;
    const text = (node.innerText || '').trim();
    if (text.length < FOLD_LIMIT) return;
    node.dataset.dwtComfort = '1';
    node.classList.add('dwt-comfort-folded');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dwt-fold-btn';
    btn.textContent = '展开长回复';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const folded = node.classList.toggle('dwt-comfort-folded');
      btn.textContent = folded ? '展开长回复' : '折叠';
    });
    node.appendChild(btn);
  }

  function scan() {
    if (!enabled) return;
    messageNodes().forEach(ensureFold);
  }

  function mountWide() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = wide ? '宽屏：开' : '宽屏：关';
    btn.addEventListener('click', async () => {
      wide = !wide;
      document.documentElement.classList.toggle('dwt-comfort-wide', wide);
      btn.textContent = wide ? '宽屏：开' : '宽屏：关';
      try { await chrome.storage.local.set({ [WIDE_KEY]: wide }); } catch (_) {}
    });
    document.body.appendChild(btn);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function apply() {
    if (!enabled) {
      document.getElementById(BTN_ID)?.remove();
      document.documentElement.classList.remove('dwt-comfort-wide');
      document.querySelectorAll('.dwt-fold-btn').forEach((b) => b.remove());
      document.querySelectorAll('.dwt-comfort-folded').forEach((n) => {
        n.classList.remove('dwt-comfort-folded');
        delete n.dataset.dwtComfort;
      });
      observer?.disconnect();
      observer = null;
      return;
    }
    injectStyles();
    mountWide();
    document.documentElement.classList.toggle('dwt-comfort-wide', wide);
    scan();
    startObserver();
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get([FEAT_KEY, WIDE_KEY]);
      enabled = r[FEAT_KEY] === true;
      wide = r[WIDE_KEY] === true;
    } catch (_) { enabled = false; }
    apply();
  }

  dwt.pageComfortModule = {
    setEnabled(v) { enabled = !!v; apply(); },
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] page-comfort ready (#87)');
})();
