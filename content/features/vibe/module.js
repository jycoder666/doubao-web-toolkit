// vibe/module.js — 背景氛围预设 (#63 ai-vibe-changer 精简版)
// 五套渐变 + 自定义取色 + 可选本地图片；不钩请求、不改正文颜色。默认关闭。
// 预设色板挂在 🎨 左侧托盘；点选 / 再点同一项取消。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_vibe';
  const PRESET_KEY = 'dwt_vibe_preset';
  const IMAGE_KEY = 'dwt_vibe_bg_image';
  const COLOR_KEY = 'dwt_vibe_solid_color';
  const STYLE_ID = 'dwt-vibe-style';
  const CHROME_STYLE_ID = 'dwt-vibe-chrome'; // 托盘 UI（含隐藏 file），氛围关着也要在
  const LAYER_ID = 'dwt-vibe-bg';
  const PRESET_ID = 'dwt-vibe-presets';
  const RAIL_ID = 'vibe'; // 与 rail.add id 一致：色板挂在 🎨 左侧悬停托盘
  const CUSTOM_ID = 'custom'; // 自定义背景图
  const SOLID_ID = 'solid'; // 自定义纯色
  // 压缩后 dataURL 上限（与 batch 附件持久化同量级）；超限提示、不落盘
  const IMAGE_DATAURL_MAX = Math.floor(2.5 * 1024 * 1024);
  const IMAGE_MAX_EDGE = 1920;
  const IMAGE_JPEG_QUALITY = 0.8;
  const DEFAULT_SOLID = '#2d78a6';

  // 浅色外观压白罩、深色外观压暗罩：正文颜色一律不动。
  // 旧实现强制 color:#f8fbff !important，撞上豆包自己的白底 = 白字白底，整页不可读。
  const SCRIM_LIGHT = 'rgba(255,255,255,.72)';
  const SCRIM_DARK = 'rgba(6,12,20,.42)';

  let enabled = false;
  let preset = 'ocean';
  let customDataUrl = '';
  let customColor = DEFAULT_SOLID;

  const PRESETS = {
    ocean: {
      name: '海洋蓝',
      dot: '#72d6ff',
      grad: 'linear-gradient(145deg,#0c1a2a 0%,#17304a 45%,#2d78a6 100%)',
      tint: 'rgba(233,243,252,.72)',
      panel: 'rgba(18,34,52,.72)',
    },
    violet: {
      name: '紫罗兰',
      dot: '#d0b7ff',
      grad: 'linear-gradient(145deg,#221537 0%,#382354 45%,#7450a6 100%)',
      tint: 'rgba(240,235,252,.72)',
      panel: 'rgba(45,29,68,.72)',
    },
    forest: {
      name: '森林绿',
      dot: '#83e8af',
      grad: 'linear-gradient(145deg,#0a251d 0%,#153d30 45%,#2d7b5a 100%)',
      tint: 'rgba(230,246,238,.72)',
      panel: 'rgba(16,48,38,.72)',
    },
    amber: {
      name: '暖金棕',
      dot: '#ffc86b',
      grad: 'linear-gradient(145deg,#2b1f14 0%,#4a351f 45%,#8a5f2b 100%)',
      tint: 'rgba(253,244,228,.72)',
      panel: 'rgba(59,44,29,.72)',
    },
    graphite: {
      name: '石墨灰',
      dot: '#a8d4ff',
      grad: 'linear-gradient(145deg,#1b1f25 0%,#303842 45%,#526273 100%)',
      tint: 'rgba(238,241,246,.72)',
      panel: 'rgba(37,42,49,.72)',
    },
  };

  // 承载「大面白底」的稳定容器（id 级）。只让这些容器透明，背景层才露得出来；
  // 旧实现是给 body 每个直接子元素写 position:relative + z-index:1 把 app 抬到背景层上面，
  // 连豆包的 1×1 浮层都没放过 —— 拿布局换层级，改的是宿主页面本身。
  const SURFACES = [
    '#root',
    '#chat-route-layout',
    '#chat-route-main',
    '#chat-route-layout main',
    '[class*="v_list_scroller"]',
  ].join(',\n      html.dwt-vibe-on ');

  // —— 存储：chrome.storage + localStorage 双写（Glass/桥失败时靠 LS）——
  function hasChromeLocal() {
    try {
      return !!(typeof chrome !== 'undefined'
        && chrome.storage
        && chrome.storage.local
        && typeof chrome.storage.local.get === 'function'
        && typeof chrome.storage.local.set === 'function');
    } catch (_) { return false; }
  }
  function lsReadRaw(key) {
    try {
      if (typeof localStorage === 'undefined') return undefined;
      const v = localStorage.getItem(key);
      return v === null ? undefined : v;
    } catch (_) { return undefined; }
  }
  function lsWriteRaw(key, value) {
    if (typeof localStorage === 'undefined') return false;
    if (value === undefined || value === null) {
      try { localStorage.removeItem(key); } catch (_) {}
      return true;
    }
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, s);
    return true;
  }
  function coerceBool(raw) {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return !!raw;
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  function dataUrlBytesApprox(data) {
    if (!data || typeof data !== 'string') return 0;
    const comma = data.indexOf(',');
    const payload = comma >= 0 ? data.length - comma - 1 : data.length;
    return Math.floor(payload * 0.75);
  }
  async function storageGet(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    let chromeMap = {};
    if (hasChromeLocal()) {
      try { chromeMap = (await chrome.storage.local.get(list)) || {}; } catch (_) { chromeMap = {}; }
    }
    const out = {};
    list.forEach((k) => {
      const cv = chromeMap[k];
      const lv = lsReadRaw(k);
      // 图片优先取更长的一方（避免桥返回空串覆盖 LS 里的真图）
      if (k === IMAGE_KEY) {
        const cs = typeof cv === 'string' ? cv : '';
        const ls = typeof lv === 'string' ? lv : '';
        const pick = cs.length >= ls.length ? cs : ls;
        if (pick) out[k] = pick;
        return;
      }
      if (cv !== undefined) out[k] = cv;
      else if (lv !== undefined) out[k] = lv;
    });
    return out;
  }
  async function storageSet(items) {
    let chromeErr = null;
    if (hasChromeLocal()) {
      try { await chrome.storage.local.set(items); } catch (e) { chromeErr = e; }
    }
    try {
      Object.keys(items || {}).forEach((k) => lsWriteRaw(k, items[k]));
      return { ok: true, chromeErr };
    } catch (e) {
      if (chromeErr) throw chromeErr;
      throw e;
    }
  }
  async function storageRemove(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (hasChromeLocal()) {
      try { await chrome.storage.local.remove(list); } catch (_) {}
    }
    list.forEach((k) => {
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); } catch (_) {}
    });
  }

  function panelColorsFor(p) {
    if (p === CUSTOM_ID || p === SOLID_ID) return PRESETS.ocean;
    return PRESETS[p] || PRESETS.ocean;
  }

  function isCustomActive() {
    return preset === CUSTOM_ID && !!customDataUrl;
  }

  function isSolidActive() {
    return preset === SOLID_ID && !!customColor;
  }

  // 自定义图/纯色时侧栏顶栏更透
  function isBleedMode() {
    return isCustomActive() || isSolidActive();
  }

  function normalizeHex(raw) {
    const s = String(raw || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return DEFAULT_SOLID;
  }

  // 托盘样式常驻：氛围关闭时 teardown 会拆掉 STYLE_ID，若 file 的 display:none 只写在那里就会露出原生「选择文件」
  function ensureChromeStyles() {
    let st = document.getElementById(CHROME_STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = CHROME_STYLE_ID;
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = `
      #${PRESET_ID} {
        display: flex; align-items: center; gap: 4px; padding: 4px 6px;
        border-radius: 999px; background: var(--dwt-bg, #fff);
        border: 1px solid var(--dwt-border, #d0d7de);
        box-shadow: 0 2px 8px rgba(0,0,0,.12); flex-wrap: nowrap; max-width: 320px;
      }
      #${PRESET_ID} button {
        width: 18px; height: 18px; border-radius: 50%; padding: 0; cursor: pointer;
        border: 2px solid transparent; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15);
        flex-shrink: 0;
      }
      #${PRESET_ID} button.dwt-on {
        border-color: #2d72de;
        box-shadow: 0 0 0 2px rgba(45,114,222,.4), inset 0 0 0 1px rgba(0,0,0,.12);
        transform: scale(1.12);
      }
      #${PRESET_ID} .dwt-vibe-sep {
        width: 1px; height: 14px; background: var(--dwt-border, #d0d7de); margin: 0 2px; flex-shrink: 0;
      }
      #${PRESET_ID} .dwt-vibe-upload,
      #${PRESET_ID} .dwt-vibe-clear {
        width: auto; min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px;
        font-size: 10px; line-height: 14px; color: var(--dwt-fg, #1f2328);
        background: var(--dwt-bg, #f6f8fa); box-shadow: none; border: 1px solid var(--dwt-border, #d0d7de);
      }
      #${PRESET_ID} .dwt-vibe-thumb {
        width: 18px; height: 18px; border-radius: 4px; padding: 0; overflow: hidden;
        background-size: cover; background-position: center; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2);
      }
      #${PRESET_ID} .dwt-vibe-thumb.dwt-on { border-color: var(--dwt-fg, #1f2328); }
      #${PRESET_ID} .dwt-vibe-color {
        -webkit-appearance: none; appearance: none;
        width: 18px; height: 18px; padding: 0; border-radius: 50%;
        border: 2px solid transparent; cursor: pointer; flex-shrink: 0;
        background: transparent; box-shadow: inset 0 0 0 1px rgba(0,0,0,.25);
      }
      #${PRESET_ID} .dwt-vibe-color.dwt-on,
      #${PRESET_ID} .dwt-vibe-thumb.dwt-on {
        border-color: #2d72de;
        box-shadow: 0 0 0 2px rgba(45,114,222,.4), inset 0 0 0 1px rgba(0,0,0,.12);
      }
      #${PRESET_ID} .dwt-vibe-color::-webkit-color-swatch-wrapper { padding: 0; }
      #${PRESET_ID} .dwt-vibe-color::-webkit-color-swatch { border: none; border-radius: 50%; }
      /* 原生 file 必须藏死：不能依赖氛围开启时的 STYLE_ID（关掉氛围会拆掉） */
      #${PRESET_ID} .dwt-vibe-file {
        position: absolute !important; width: 0 !important; height: 0 !important;
        opacity: 0 !important; pointer-events: none !important; overflow: hidden !important;
        clip: rect(0, 0, 0, 0) !important; border: 0 !important; padding: 0 !important; margin: 0 !important;
      }
    `;
  }

  function cssFor(p) {
    const c = panelColorsFor(p);
    // 渐变档走 CSS；自定义图用层上行内 background 覆盖（cover/居中），避免大 dataURL 塞进 style 标签
    return `
      /* 背景层：z-index:-1 落在所有内容之下（canvas 背景之上），不抬任何元素 */
      #${LAYER_ID} {
        position: fixed; inset: 0; z-index: -1; pointer-events: none;
      }
      html.dwt-vibe-on, html.dwt-vibe-on body { background: transparent !important; }
      html.dwt-vibe-on #${LAYER_ID} {
        background: linear-gradient(${SCRIM_LIGHT}, ${SCRIM_LIGHT}), ${c.grad};
      }
      html.dwt-ui-dark.dwt-vibe-on #${LAYER_ID} {
        background: linear-gradient(${SCRIM_DARK}, ${SCRIM_DARK}), ${c.grad};
      }
      html.dwt-vibe-on ${SURFACES} { background-color: transparent !important; }
      /* 顶栏：豆包用 bg-[var(--chat-bg-color)] 实心底，挡住整页背景层 —— 打开氛围时让出 */
      html.dwt-vibe-on [class*="h-header-height"] {
        background-image: none !important;
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        background-color: rgba(255,255,255,.28) !important;
      }
      html.dwt-ui-dark.dwt-vibe-on [class*="h-header-height"] {
        background-color: rgba(0,0,0,.16) !important;
      }
      /* 侧栏与输入框做磨砂面板。只认 id / 语义容器：
         旧实现用 [class*="sidebar"] 命中了每个 .group/sidebar_nav_item（几十个元素全刷深色底），
         还用裸 aside 命中了插件自己的导航轨道。 */
      html.dwt-vibe-on #flow_chat_sidebar,
      html.dwt-vibe-on #flow_chat_sidebar > div,
      html.dwt-vibe-on #flow_chat_sidebar > div > div,
      html.dwt-vibe-on .guidance-input-surface {
        background-color: ${c.tint} !important;
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
      }
      html.dwt-ui-dark.dwt-vibe-on #flow_chat_sidebar,
      html.dwt-ui-dark.dwt-vibe-on #flow_chat_sidebar > div,
      html.dwt-ui-dark.dwt-vibe-on #flow_chat_sidebar > div > div,
      html.dwt-ui-dark.dwt-vibe-on .guidance-input-surface {
        background-color: ${c.panel} !important;
      }
      /* 自定义图/纯色：侧栏/顶栏再透一点（渐变预设仍用上面较实的磨砂） */
      html.dwt-vibe-on.dwt-vibe-custom #flow_chat_sidebar,
      html.dwt-vibe-on.dwt-vibe-custom #flow_chat_sidebar > div,
      html.dwt-vibe-on.dwt-vibe-custom #flow_chat_sidebar > div > div {
        background-color: rgba(255,255,255,.18) !important;
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
      }
      html.dwt-ui-dark.dwt-vibe-on.dwt-vibe-custom #flow_chat_sidebar,
      html.dwt-ui-dark.dwt-vibe-on.dwt-vibe-custom #flow_chat_sidebar > div,
      html.dwt-ui-dark.dwt-vibe-on.dwt-vibe-custom #flow_chat_sidebar > div > div {
        background-color: rgba(6,12,20,.26) !important;
      }
      html.dwt-vibe-on.dwt-vibe-custom [class*="h-header-height"] {
        background-color: rgba(255,255,255,.10) !important;
      }
      html.dwt-ui-dark.dwt-vibe-on.dwt-vibe-custom [class*="h-header-height"] {
        background-color: rgba(0,0,0,.08) !important;
      }
    `;
  }

  function currentScrim() {
    return document.documentElement.classList.contains('dwt-ui-dark') ? SCRIM_DARK : SCRIM_LIGHT;
  }

  function paintLayerBg() {
    const layer = document.getElementById(LAYER_ID);
    if (!layer) return;
    const scrim = currentScrim();
    if (isCustomActive()) {
      // cover + 居中；压罩叠在图上保证可读；层仍 pointer-events:none
      layer.style.background = `linear-gradient(${scrim}, ${scrim}), url("${customDataUrl}") center / cover no-repeat`;
    } else if (isSolidActive()) {
      layer.style.background = `linear-gradient(${scrim}, ${scrim}), ${customColor}`;
    } else {
      layer.style.background = '';
    }
  }

  function ensureLayer() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      document.documentElement.appendChild(layer);
    }
    return layer;
  }

  function showQuotaTip(msg) {
    const btn = document.querySelector(`#${PRESET_ID} .dwt-vibe-upload`);
    if (btn) {
      const prev = btn.getAttribute('data-tip-default') || btn.title;
      btn.setAttribute('data-tip-default', prev);
      btn.title = msg;
      btn.textContent = '!';
      setTimeout(() => {
        btn.title = btn.getAttribute('data-tip-default') || '上传背景';
        btn.textContent = '图';
      }, 2800);
    }
    try { console.warn('[dwt][vibe]', msg); } catch (_) {}
  }

  function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//i.test(file.type || '')) {
        reject(new Error('请选择图片文件'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) { reject(new Error('无法读取图片尺寸')); return; }
          const max = IMAGE_MAX_EDGE;
          if (Math.max(w, h) > max) {
            if (w >= h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('画布不可用')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl;
          try {
            dataUrl = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
          } catch (e) {
            reject(e || new Error('压缩失败'));
            return;
          }
          if (dataUrlBytesApprox(dataUrl) > IMAGE_DATAURL_MAX) {
            reject(new Error('图片过大（压缩后仍超 2.5MB），请换更小的图'));
            return;
          }
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        try { URL.revokeObjectURL(url); } catch (_) {}
        reject(new Error('读图失败'));
      };
      img.src = url;
    });
  }

  function syncPresetButtons(row) {
    if (!row) return;
    // 关闭氛围时不亮选中环，避免「已取消却仍看起来选中」
    row.querySelectorAll('button[data-preset]').forEach((b) => {
      b.classList.toggle('dwt-on', enabled && b.dataset.preset === preset);
    });
    const colorEl = row.querySelector('.dwt-vibe-color');
    if (colorEl) {
      colorEl.value = customColor || DEFAULT_SOLID;
      colorEl.classList.toggle('dwt-on', enabled && isSolidActive());
    }
    const thumb = row.querySelector('.dwt-vibe-thumb');
    if (thumb) {
      thumb.classList.toggle('dwt-on', enabled && isCustomActive());
      thumb.style.display = customDataUrl ? '' : 'none';
      if (customDataUrl) thumb.style.backgroundImage = `url("${customDataUrl}")`;
      else thumb.style.backgroundImage = '';
    }
    const clearBtn = row.querySelector('.dwt-vibe-clear');
    if (clearBtn) clearBtn.style.display = customDataUrl ? '' : 'none';
    // 保险：file 始终藏死（不依赖 style 标签是否还在）
    const file = row.querySelector('.dwt-vibe-file');
    if (file) {
      file.hidden = true;
      file.setAttribute('aria-hidden', 'true');
      file.tabIndex = -1;
      file.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;clip:rect(0,0,0,0);border:0;padding:0;margin:0;';
    }
  }

  // 预设色板：挂在 🎨 左侧悬停托盘（rail.attachTray，render 后补回）
  // rebuild=true 时拆掉旧 DOM：重注入后旧按钮仍绑着上一轮闭包，点自定义会落到空 customDataUrl 直接 return
  function ensurePresetRow(rebuild) {
    let row = document.getElementById(PRESET_ID);
    if (rebuild && row) {
      try {
        const rail = window.dwt && window.dwt.rail;
        if (rail && typeof rail.detachTray === 'function') rail.detachTray(RAIL_ID);
        else if (rail && typeof rail.removeCustomRow === 'function') rail.removeCustomRow('vibe-presets');
      } catch (_) {}
      row.remove();
      row = null;
    }
    if (!row) {
      row = document.createElement('div');
      row.id = PRESET_ID;
      Object.keys(PRESETS).forEach((key) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.preset = key;
        btn.title = PRESETS[key].name;
        btn.style.background = PRESETS[key].dot;
        row.appendChild(btn);
      });

      const sep = document.createElement('span');
      sep.className = 'dwt-vibe-sep';
      sep.setAttribute('aria-hidden', 'true');
      row.appendChild(sep);

      // 自定义颜色（原生取色器）—— 与上传背景图分开，互不顶替
      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'dwt-vibe-color';
      color.title = '自定义颜色';
      color.value = customColor || DEFAULT_SOLID;
      color.dataset.preset = SOLID_ID;
      color.addEventListener('click', (e) => {
        // 已选纯色再点圆环 → 取消；否则让浏览器弹出取色面板
        if (enabled && isSolidActive()) {
          e.preventDefault();
          setEnabled(false);
          return;
        }
        e.stopPropagation();
      });
      color.addEventListener('input', () => {
        customColor = normalizeHex(color.value);
        preset = SOLID_ID;
        enabled = true;
        apply();
        void storageSet({ [FEAT_KEY]: true, [PRESET_KEY]: SOLID_ID, [COLOR_KEY]: customColor });
      });
      row.appendChild(color);

      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'dwt-vibe-thumb';
      thumb.dataset.preset = CUSTOM_ID;
      thumb.title = '已上传的背景图';
      row.appendChild(thumb);

      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.className = 'dwt-vibe-file';
      file.hidden = true;
      file.setAttribute('aria-hidden', 'true');
      file.tabIndex = -1;
      file.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;clip:rect(0,0,0,0);border:0;padding:0;margin:0;';
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (f) void onPickImage(f);
      });
      row.appendChild(file);

      const upload = document.createElement('button');
      upload.type = 'button';
      upload.className = 'dwt-vibe-upload';
      upload.textContent = '图';
      upload.title = '上传背景图';
      upload.dataset.action = 'upload';
      row.appendChild(upload);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'dwt-vibe-clear';
      clearBtn.textContent = '×';
      clearBtn.title = '清除已上传的背景图';
      clearBtn.dataset.action = 'clear';
      row.appendChild(clearBtn);
    }
    ensureChromeStyles();
    // 事件委托（onclick 覆盖）：重注入不会叠多个旧闭包
    row.onclick = (e) => {
      const t = e.target && e.target.closest && e.target.closest('button, [data-preset]');
      if (!t || !row.contains(t)) return;
      // 取色器自己处理，不要在这里 preventDefault 挡住系统面板
      if (t.classList && t.classList.contains('dwt-vibe-color')) return;
      e.preventDefault();
      e.stopPropagation();
      const action = t.getAttribute('data-action');
      if (action === 'upload') {
        const file = row.querySelector('.dwt-vibe-file');
        if (file) file.click();
        return;
      }
      if (action === 'clear') {
        void clearCustomImage();
        return;
      }
      const id = t.getAttribute('data-preset');
      if (id === CUSTOM_ID) void selectCustom();
      else if (id === SOLID_ID) setPreset(SOLID_ID);
      else if (id) setPreset(id);
    };
    const rail = window.dwt && window.dwt.rail;
    if (rail && typeof rail.attachTray === 'function') {
      rail.attachTray(RAIL_ID, row);
    } else if (rail && typeof rail.addCustomRow === 'function') {
      // 旧 rail 兜底（尚未带 attachTray 的注入）
      rail.addCustomRow('vibe-presets', row);
    } else {
      const menu = document.getElementById('dwt-rail-menu');
      if (menu && row.parentElement !== menu) menu.appendChild(row);
    }
    syncPresetButtons(row);
    return row;
  }

  function ensureUi() {
    ensureLayer();
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    st.textContent = cssFor(preset);
    paintLayerBg();
  }

  function teardownBg() {
    document.documentElement.classList.remove('dwt-vibe-on', 'dwt-vibe-custom');
    document.getElementById(LAYER_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    // 故意保留 CHROME_STYLE_ID：托盘 / 藏 file / 取色器样式氛围关掉也要在
  }

  function apply() {
    if (!enabled) {
      teardownBg();
      // 功能关：拆托盘 + 卸 rail，避免菜单中间留 220px 悬停热区空洞
      try {
        const rail = window.dwt && window.dwt.rail;
        if (rail && typeof rail.detachTray === 'function') rail.detachTray(RAIL_ID);
        if (rail && typeof rail.removeCustomRow === 'function') rail.removeCustomRow('vibe-presets');
        if (rail && typeof rail.remove === 'function') rail.remove(RAIL_ID);
      } catch (_) {}
      const row = document.getElementById(PRESET_ID);
      if (row) row.remove();
      return;
    }
    mountRail();
    ensurePresetRow();
    window.dwt?.rail?.setActive?.(RAIL_ID, true);
    document.documentElement.classList.add('dwt-vibe-on');
    document.documentElement.classList.toggle('dwt-vibe-custom', isBleedMode());
    ensureUi();
    syncPresetButtons(document.getElementById(PRESET_ID));
  }

  function setEnabled(v) {
    enabled = !!v;
    apply();
    // 从 rail 点开关也要落盘：否则重注入/刷新后 init() 读回旧值，功能自己弹回去，
    // 弹窗里的开关状态也会和页面不一致（弹窗读的就是这个键）。
    void storageSet({ [FEAT_KEY]: enabled });
  }

  function setPreset(id) {
    if (id === CUSTOM_ID) {
      if (!customDataUrl) return false;
    } else if (id === SOLID_ID) {
      if (!customColor) customColor = DEFAULT_SOLID;
    } else if (!PRESETS[id]) {
      return false;
    }
    // 已选中再点 → 取消（关氛围）
    if (enabled && preset === id) {
      setEnabled(false);
      return true;
    }
    preset = id;
    enabled = true;
    // 先画再存：存储往返不该拖慢点击反馈
    apply();
    const payload = { [FEAT_KEY]: true, [PRESET_KEY]: preset };
    if (id === SOLID_ID) payload[COLOR_KEY] = customColor;
    void storageSet(payload);
    return true;
  }

  // 点「已上传背景图」缩略图：切回图片档；没有图时提示去点「图」，绝不把原生 file 露出来
  async function selectCustom() {
    if (!customDataUrl) {
      try {
        const r = await storageGet([IMAGE_KEY]);
        const img = typeof r[IMAGE_KEY] === 'string' ? r[IMAGE_KEY] : '';
        if (img && img.indexOf('data:image/') === 0 && dataUrlBytesApprox(img) <= IMAGE_DATAURL_MAX) {
          customDataUrl = img;
        }
      } catch (_) {}
    }
    if (!customDataUrl) {
      showQuotaTip('还没有背景图，请点「图」上传');
      return;
    }
    setPreset(CUSTOM_ID);
  }

  async function onPickImage(file) {
    try {
      const dataUrl = await compressImageFile(file);
      customDataUrl = dataUrl;
      preset = CUSTOM_ID;
      if (!enabled) enabled = true;
      apply();
      try {
        await storageSet({
          [FEAT_KEY]: enabled,
          [PRESET_KEY]: CUSTOM_ID,
          [IMAGE_KEY]: customDataUrl,
        });
      } catch (e) {
        customDataUrl = '';
        preset = 'ocean';
        apply();
        showQuotaTip('存储配额不足，背景未保存（可换更小的图）');
        try { await storageRemove([IMAGE_KEY]); } catch (_) {}
        void storageSet({ [PRESET_KEY]: 'ocean', [FEAT_KEY]: enabled });
      }
    } catch (e) {
      showQuotaTip((e && e.message) || '上传失败');
    }
  }

  async function clearCustomImage() {
    customDataUrl = '';
    if (preset === CUSTOM_ID) preset = 'ocean';
    apply();
    try { await storageRemove([IMAGE_KEY]); } catch (_) {}
    void storageSet({ [PRESET_KEY]: preset });
  }

  async function init() {
    try {
      const r = await storageGet([FEAT_KEY, PRESET_KEY, IMAGE_KEY, COLOR_KEY]);
      enabled = coerceBool(r[FEAT_KEY]); // 默认关（缺省/false）
      const img = typeof r[IMAGE_KEY] === 'string' ? r[IMAGE_KEY] : '';
      if (img && img.indexOf('data:image/') === 0 && dataUrlBytesApprox(img) <= IMAGE_DATAURL_MAX) {
        customDataUrl = img;
      }
      customColor = normalizeHex(r[COLOR_KEY] || customColor || DEFAULT_SOLID);
      if (r[PRESET_KEY] === CUSTOM_ID && customDataUrl) preset = CUSTOM_ID;
      else if (r[PRESET_KEY] === SOLID_ID) preset = SOLID_ID;
      else if (r[PRESET_KEY] && PRESETS[r[PRESET_KEY]]) preset = r[PRESET_KEY];
    } catch (_) { enabled = false; }
    // 仅开启时挂 rail/色板；关闭时由 apply() 卸干净
    apply();
    if (enabled) ensurePresetRow(true);
    try {
      document.addEventListener('dwt:themechange', () => {
        if (enabled && (isCustomActive() || isSolidActive())) paintLayerBg();
      });
    } catch (_) {}
  }

  // 统一工具栏入口
  function mountRail() {
    window.dwt?.rail?.add?.({
      id: 'vibe',
      icon: '🎨',
      title: '背景氛围',
      order: 47,
      // 点色板内控件时不关 🧰；托盘本身只靠悬停显隐，不靠点 🎨
      keepMenuOpen: true,
      onClick: () => {
        // 故意空：显示/隐藏由 hover；选中/取消由色点与取色器负责
        ensurePresetRow();
      },
    });
  }

  dwt.vibeModule = {
    setEnabled,
    setPreset,
    selectCustom,
    getPreset: () => preset,
    getSolidColor: () => customColor || DEFAULT_SOLID,
    listPresets: () => Object.keys(PRESETS).map((k) => ({ id: k, name: PRESETS[k].name }))
      .concat([{ id: SOLID_ID, name: '自定义颜色' }])
      .concat(customDataUrl ? [{ id: CUSTOM_ID, name: '自定义背景图' }] : []),
    clearCustomImage,
    getCustomImage: () => customDataUrl || '',
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] vibe ready (#63+solid-color)');
})();
