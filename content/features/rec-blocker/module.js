// rec-blocker/module.js — 首页推荐屏蔽 (#58 recommendation-blocker)
// 仅 CSS 隐藏豆包首页建议/推荐区；不碰请求、不改登录态。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_rec_blocker';
  const STYLE_ID = 'dwt-rec-blocker-style';

  let enabled = true;

  // 来源 #58：#experiment-guidance-suggestions；并兜底常见推荐/建议容器
  const HIDE_CSS = `
    #experiment-guidance-suggestions,
    [id*="guidance-suggestion"],
    [class*="guidance-suggestion"],
    [class*="suggest-list"],
    [class*="SuggestList"],
    [class*="recommend-card"],
    [class*="RecommendCard"],
    [data-testid*="suggest"],
    [data-testid*="recommend"] {
      display: none !important;
    }
  `;

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = HIDE_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function remove() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function apply() {
    if (enabled) inject();
    else remove();
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(FEAT_KEY);
      enabled = r[FEAT_KEY] !== false; // 默认开
    } catch (_) { enabled = true; }
    apply();
  }

  dwt.recBlockerModule = {
    setEnabled(v) { enabled = !!v; apply(); },
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] rec-blocker ready (#58)');
})();
