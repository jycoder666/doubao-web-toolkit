// vibe/module.js — 背景氛围预设 (#63 ai-vibe-changer 精简版)
// 五套 CSS 变量色板 + 渐变背景层；不上传图片、不钩请求。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_vibe';
  const PRESET_KEY = 'dwt_vibe_preset';
  const STYLE_ID = 'dwt-vibe-style';
  const LAYER_ID = 'dwt-vibe-bg';
  const TOGGLE_ID = 'dwt-vibe-toggle';

  let enabled = false;
  let preset = 'ocean';

  const PRESETS = {
    ocean: {
      name: '海洋蓝',
      accent: '#72d6ff',
      panel: 'rgba(18,34,52,.72)',
      text: '#f8fbff',
      grad: 'linear-gradient(145deg,#0c1a2a 0%,#17304a 45%,#2d78a6 100%)',
    },
    violet: {
      name: '紫罗兰',
      accent: '#d0b7ff',
      panel: 'rgba(45,29,68,.72)',
      text: '#fffaff',
      grad: 'linear-gradient(145deg,#221537 0%,#382354 45%,#7450a6 100%)',
    },
    forest: {
      name: '森林绿',
      accent: '#83e8af',
      panel: 'rgba(16,48,38,.72)',
      text: '#f5fff9',
      grad: 'linear-gradient(145deg,#0a251d 0%,#153d30 45%,#2d7b5a 100%)',
    },
    amber: {
      name: '暖金棕',
      accent: '#ffc86b',
      panel: 'rgba(59,44,29,.72)',
      text: '#fffaf1',
      grad: 'linear-gradient(145deg,#2b1f14 0%,#4a351f 45%,#8a5f2b 100%)',
    },
    graphite: {
      name: '石墨灰',
      accent: '#a8d4ff',
      panel: 'rgba(37,42,49,.72)',
      text: '#ffffff',
      grad: 'linear-gradient(145deg,#1b1f25 0%,#303842 45%,#526273 100%)',
    },
  };

  function cssFor(p) {
    const c = PRESETS[p] || PRESETS.ocean;
    return `
      #${LAYER_ID} {
        position: fixed; inset: 0; z-index: 0; pointer-events: none;
        background: ${c.grad}; opacity: .92;
      }
      html.dwt-vibe-on, html.dwt-vibe-on body {
        background: transparent !important;
        color: ${c.text} !important;
      }
      html.dwt-vibe-on body > *:not(#${LAYER_ID}):not(#${TOGGLE_ID}):not([id^="dwt-"]) {
        position: relative; z-index: 1;
      }
      html.dwt-vibe-on [class*="sidebar"],
      html.dwt-vibe-on aside,
      html.dwt-vibe-on [class*="side-bar"] {
        background: ${c.panel} !important;
        backdrop-filter: blur(12px);
      }
      html.dwt-vibe-on [class*="ProseMirror"],
      html.dwt-vibe-on [class*="composer"],
      html.dwt-vibe-on [class*="input-area"] {
        background: ${c.panel} !important;
        color: ${c.text} !important;
        border-color: ${c.accent}55 !important;
      }
      #${TOGGLE_ID} {
        position: fixed; left: 12px; bottom: 12px; z-index: 999996;
        display: flex; gap: 4px; flex-wrap: wrap; max-width: 220px;
        padding: 6px; background: rgba(0,0,0,.55); border-radius: 10px;
        backdrop-filter: blur(8px);
      }
      #${TOGGLE_ID} button {
        border: 1px solid transparent; border-radius: 6px; padding: 3px 7px;
        font-size: 11px; cursor: pointer; color: #fff; background: #333;
      }
      #${TOGGLE_ID} button.active {
        border-color: ${c.accent}; background: ${c.accent}33; color: ${c.accent};
      }
    `;
  }

  function ensureUi() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      document.documentElement.appendChild(layer);
    }
    let bar = document.getElementById(TOGGLE_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = TOGGLE_ID;
      Object.keys(PRESETS).forEach((key) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.preset = key;
        btn.textContent = PRESETS[key].name;
        btn.addEventListener('click', () => setPreset(key));
        bar.appendChild(btn);
      });
      document.documentElement.appendChild(bar);
    }
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    st.textContent = cssFor(preset);
    bar.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === preset);
    });
  }

  function teardown() {
    document.documentElement.classList.remove('dwt-vibe-on');
    document.getElementById(LAYER_ID)?.remove();
    document.getElementById(TOGGLE_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  function apply() {
    if (!enabled) { teardown(); return; }
    document.documentElement.classList.add('dwt-vibe-on');
    ensureUi();
  }

  async function setPreset(id) {
    if (!PRESETS[id]) return;
    preset = id;
    try { await chrome.storage.local.set({ [PRESET_KEY]: preset }); } catch (_) {}
    apply();
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get([FEAT_KEY, PRESET_KEY]);
      enabled = r[FEAT_KEY] === true; // 默认关
      if (r[PRESET_KEY] && PRESETS[r[PRESET_KEY]]) preset = r[PRESET_KEY];
    } catch (_) { enabled = false; }
    apply();
  }

  dwt.vibeModule = {
    setEnabled(v) { enabled = !!v; apply(); },
    setPreset,
    getPreset: () => preset,
    listPresets: () => Object.keys(PRESETS).map((k) => ({ id: k, name: PRESETS[k].name })),
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] vibe ready (#63)');
})();
