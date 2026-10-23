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

  // ⓘ 用法说明：rail 菜单行标题右侧
  const HELP = {
    title: '🖥 宽屏模式',
    desc: '放开正文容器的最大宽度，让长回复在宽屏上铺满（只改布局，不动内容）。',
    rows: [
      ['怎么用', '点工具栏 🖥 开 / 关，按钮亮起 = 宽屏已开'],
      ['管什么', 'main / .chat / 消息滚动容器的 max-width 与 width'],
      ['长回复折叠', '开启本功能后，超过 220 字的回复会被折起来，末尾给「展开长回复」按钮'],
    ],
    note: '不拦截请求、不改模型参数；只加 CSS 类（html.dwt-comfort-wide）。豆包自己改版后选择器可能对不上，那时宽屏就只剩折叠还在起作用。',
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      html.dwt-comfort-wide main, html.dwt-comfort-wide .chat,
      html.dwt-comfort-wide .v_list_scroller { max-width: none !important; width: auto !important; }
      .dwt-comfort-folded { max-height: 7.2em; overflow: hidden; }
      .dwt-fold-btn {
        display: inline-block; margin-top: 6px; border: none; background: var(--dwt-soft, #eef1f4);
        border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer;
        color: var(--dwt-accent, #0969da);
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

  function setWide(v) {
    wide = !!v;
    document.documentElement.classList.toggle('dwt-comfort-wide', wide);
    try { chrome.storage.local.set({ [WIDE_KEY]: wide }); } catch (_) {}
    window.dwt?.rail?.setActive?.('comfort', wide);
  }

  function mountWide() {
    // 入口移入统一工具栏 (原 fixed 按钮移除)；无独立弹窗，说明不挂 rail ⓘ
    try { window.dwt?.rail?.remove?.('comfort'); } catch (_) {}
    window.dwt?.rail?.add?.({
      id: 'comfort',
      icon: '🖥',
      title: '宽屏模式',
      order: 40,
      onClick: () => setWide(!wide),
    });
    window.dwt?.rail?.setActive?.('comfort', wide);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function apply() {
    if (!enabled) {
      document.documentElement.classList.remove('dwt-comfort-wide');
      document.querySelectorAll('.dwt-fold-btn').forEach((b) => b.remove());
      document.querySelectorAll('.dwt-comfort-folded').forEach((n) => {
        n.classList.remove('dwt-comfort-folded');
        delete n.dataset.dwtComfort;
      });
      observer?.disconnect();
      observer = null;
      try { window.dwt?.rail?.remove?.('comfort'); } catch (_) {}
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
