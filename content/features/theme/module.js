// theme/module.js — 外观跟随：把豆包自己的深浅色设置映射到插件 UI (html.dwt-ui-dark)
// 信号优先级: html[data-theme] → localStorage['dbx-web-theme'] → 页面背景亮度 → prefers-color-scheme
// 入口就是豆包「设置 → 外观」，因此不注册 rail 🌓；旧 #dwt-theme-dark / data-dwt-theme 残留会被清掉。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const DARK_CLASS = 'dwt-ui-dark';
  const THEME_ATTR = 'data-theme';
  const LS_KEY = 'dbx-web-theme';
  const MODE_KEY = 'dwt_theme_mode';
  const POLL_MS = 1500;

  let mode = 'auto'; // auto = 跟随豆包 | dark | light（调试/强制用）
  let applying = false;
  let mo = null;
  let poll = null;

  /** 豆包自己的主题信号；拿不到返回 null */
  function readSignal() {
    try {
      const a = document.documentElement.getAttribute(THEME_ATTR);
      if (a === 'dark' || a === 'light') return a;
    } catch (_) { /* 忽略 */ }
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v === 'dark' || v === 'light') return v;
    } catch (_) { /* 忽略 */ }
    return null;
  }

  // 没有信号时的兜底：读页面真实容器背景亮度。
  // 不优先信 prefers-color-scheme —— 系统深色 + 豆包浅色是常态（本机即如此），信系统会判反。
  function pageLuminanceDark() {
    try {
      let bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) {
        let el = document.querySelector('[class*="scroller"]') || document.querySelector('main');
        while (el && el !== document.documentElement) {
          const c = getComputedStyle(el).backgroundColor;
          if (c && c !== 'transparent' && !c.startsWith('rgba(0, 0, 0, 0)')) { bg = c; break; }
          el = el.parentElement;
        }
      }
      const m = String(bg).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
        return lum < 100;
      }
    } catch (_) { /* 忽略 */ }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function isDark() {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    const s = readSignal();
    if (s) return s === 'dark';
    return pageLuminanceDark();
  }

  /** 幂等：只有和当前状态不一致才动 DOM，避免 MutationObserver 自激 */
  function apply(force) {
    let dark = false;
    try { dark = isDark(); } catch (_) { dark = false; }
    try {
      const el = document.documentElement;
      if (force || el.classList.contains(DARK_CLASS) !== dark) {
        applying = true;
        el.classList.toggle(DARK_CLASS, dark);
        applying = false;
        // 自带平行配色的模块（navigator 的 .dwt-nav-dark）不随 CSS 变量翻转，需主动重算
        try {
          document.dispatchEvent(new CustomEvent('dwt:themechange', { detail: { dark: dark } }));
        } catch (_) { /* 忽略 */ }
      }
    } catch (_) { applying = false; }
    return dark;
  }

  function watch() {
    try {
      mo = new MutationObserver(() => { if (!applying) apply(false); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTR, 'class', 'style'] });
    } catch (_) { /* 忽略 */ }
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onMq = () => apply(false);
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    } catch (_) { /* 忽略 */ }
    try {
      window.addEventListener('storage', (e) => { if (!e || e.key === LS_KEY) apply(false); });
    } catch (_) { /* 忽略 */ }
    // 兜底轮询：覆盖 data-theme 之外的切换路径（属性挂 body / 只重绘背景色）
    try { poll = setInterval(() => { if (!applying) apply(false); }, POLL_MS); } catch (_) { /* 忽略 */ }
  }

  // 历史残留：DWT 自己的暗色 style / 属性 / rail 🌓 入口
  function cleanupLegacy() {
    try {
      const stale = document.getElementById('dwt-theme-dark');
      if (stale) stale.remove();
      document.documentElement.removeAttribute('data-dwt-theme');
    } catch (_) { /* 忽略 */ }
    try { dwt.rail && dwt.rail.remove && dwt.rail.remove('theme'); } catch (_) { /* 忽略 */ }
    try {
      const menu = document.getElementById('dwt-rail-menu');
      if (menu) {
        Array.from(menu.querySelectorAll('.dwt-rail-item')).forEach((el) => {
          const t = (el.title || '') + (el.textContent || '');
          if (t.indexOf('🌓') >= 0 || /深色\s*\/\s*浅色/.test(t)) {
            const row = el.closest('.dwt-rail-row');
            (row || el).remove();
          }
        });
      }
    } catch (_) { /* 忽略 */ }
    // 旧桩模块的强制模式键（无任何读取方）：留着会让人误以为外观被写死
    try { if (chrome?.storage?.local?.remove) chrome.storage.local.remove('dwt_theme'); } catch (_) { /* 忽略 */ }
  }

  async function loadMode() {
    try {
      const r = await chrome.storage.local.get(MODE_KEY);
      const v = r && r[MODE_KEY];
      if (v === 'dark' || v === 'light' || v === 'auto') mode = v;
    } catch (_) { /* mock / 无 storage → auto */ }
    apply(true);
  }

  function init() {
    cleanupLegacy();
    apply(true); // 同步先上色，避免面板先亮后暗
    watch();
    loadMode();
  }

  dwt.themeModule = {
    init,
    apply,
    refresh: () => apply(true),
    isDark,
    getCurrent: () => (isDark() ? 'dark' : 'light'),
    getMode: () => mode,
    setMode(v) {
      mode = (v === 'dark' || v === 'light') ? v : 'auto';
      apply(true);
      try { chrome.storage.local.set({ [MODE_KEY]: mode }); } catch (_) { /* 忽略 */ }
      return mode;
    },
    DARK_CLASS, THEME_ATTR, LS_KEY, MODE_KEY,
  };

  init();
  console.log('[cs][doubao-web-toolkit] theme module ready (follow Doubao appearance: '
    + (isDark() ? 'dark' : 'light') + ')');
})();
