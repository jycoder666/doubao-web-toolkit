// panel-drag/module.js — 浮动面板拖拽核心 (dwt.drag)
// 各功能模块的弹窗面板（批量问答 / 对话摘要 / 联网来源 / 回复大纲 / 语料板 / 对话管理 /
// 调试面板 / 视觉关键词 / 英语拆行）统一走这里：把手拖拽 + 视口夹取 + 位置落盘 + 重注入还原。
// 设计约束（踩过的坑都写在这）：
//   1. 只从「把手」进入拖拽（面板标题行）；把手里的按钮/输入/链接/可编辑元素一律不参与，
//      否则点 × / 点输入框会被拖拽吞掉。
//   2. 拖拽期间用 window 上的 pointermove/pointerup（capture），pointerup 一定摘监听 ——
//      挂在把手上的话，面板被重建（摘要/来源面板每次打开都重建）时监听会跟着丢。
//   3. 位置写 chrome.storage.local 的 dwt_panel_pos（一个键存所有面板，避免每面板一个键）；
//      只在 pointerup 落盘（不是每帧），开发链的存储桥是 HTTP 往返，逐帧写会卡。
//      落盘是「读-改-写只合并本次改过的键」：整份 posMap 写回会让重注入期间并存的旧实例
//      用旧快照冲掉新键（位置自己跳回去 / 别的面板位置消失）。
//   4. 面板可能 display:none（打开时才显示）→ 量不到尺寸就用落盘时记的 w/h 夹取；
//      显示时再调一次 restore(el) 即可贴回原位。
//   5. 重注入会新建实例（新实例的 bound 是空的）：绑定同时记在元素上（el.__dwtDragBound），
//      attach 时按元素摘掉上一实例的监听；resize/load 回调用 owns() 判归属。
//      只靠实例内的 Map 摘不掉旧监听 —— 两个 handler 同时拖、各自 persist，落盘互相覆盖。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_panel_pos';      // { [key]: {left, top, w, h} }
  const STYLE_ID = 'dwt-drag-style';
  const EDGE = 4;                   // 面板与视口边缘的最小间距
  const MOVE_MIN = 3;               // 位移阈值：小于它算点击、不算拖拽
  const SAVE_MS = 200;              // 落盘防抖

  // 把手内的交互元素：点到它们不进入拖拽
  const EXCLUDE = 'button,a,input,textarea,select,label,summary,[contenteditable="true"],[contenteditable=""],.dwt-no-drag';

  const posMap = {};                // key -> {left, top, w, h}
  const bound = new Map();          // el -> {key, handle, onDown, onRestore, onEnd}
  const dirty = new Set();          // 待落盘的 key（只写自己改过的键，见 persist）
  let loaded = false;
  let saveTimer = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      .dwt-drag-handle { cursor: move; user-select: none; -webkit-user-select: none; }
      .dwt-dragging {
        cursor: grabbing !important;
        user-select: none !important; -webkit-user-select: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- 落盘 / 还原 ----------

  function load() {
    if (loaded) return Promise.resolve(posMap);
    return Promise.resolve()
      .then(() => chrome.storage.local.get(KEY))
      .then((r) => {
        const v = r && r[KEY];
        if (v && typeof v === 'object') {
          Object.keys(v).forEach((k) => {
            const p = v[k];
            if (p && typeof p.left === 'number' && typeof p.top === 'number') {
              posMap[k] = { left: p.left, top: p.top, w: p.w || 0, h: p.h || 0 };
            }
          });
        }
      })
      .catch(() => {})
      .then(() => {
        loaded = true;
        bound.forEach((_b, el) => { if (el.isConnected && owns(el, _b)) restore(el); });
      });
  }

  // 落盘只覆盖「本次改过的键」：posMap 是实例启动时读的整份快照，
  // 整份写回会让另一个实例（重注入后短暂并存）的旧快照把新键冲掉 / 把旧值复活 —— 真机表现为
  // 「拖过的面板位置过一会儿自己跳回去、别的面板位置莫名消失」。读-改-写把窗口缩到一次往返。
  function persist(key) {
    if (key) dirty.add(key);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      const patch = {};
      const gone = [];
      dirty.forEach((k) => { if (posMap[k]) patch[k] = posMap[k]; else gone.push(k); });
      dirty.clear();
      try {
        Promise.resolve(chrome.storage.local.get(KEY))
          .then((r) => {
            const cur = (r && r[KEY] && typeof r[KEY] === 'object') ? Object.assign({}, r[KEY]) : {};
            Object.keys(patch).forEach((k) => { cur[k] = patch[k]; });
            gone.forEach((k) => { delete cur[k]; });
            return chrome.storage.local.set({ [KEY]: cur });
          })
          .catch(() => {});
      } catch (_) {}
    }, SAVE_MS);
  }

  function clampXY(left, top, w, h) {
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const maxL = Math.max(EDGE, vw - (w || 0) - EDGE);
    const maxT = Math.max(EDGE, vh - (h || 0) - EDGE);
    return {
      left: Math.round(Math.min(Math.max(left, EDGE), maxL)),
      top: Math.round(Math.min(Math.max(top, EDGE), maxT)),
    };
  }

  // 统一落到 left/top（清 right/bottom）：右/下锚定的面板（spark/outline/digest…）也能拖
  function place(el, p) {
    el.style.position = 'fixed';
    el.style.left = p.left + 'px';
    el.style.top = p.top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function restore(el) {
    const b = (el && el.__dwtDragBound) || bound.get(el);
    if (!b) return false;
    const p = posMap[b.key];
    if (!p) return false;
    const r = el.getBoundingClientRect();
    const w = r.width || p.w || 0;      // display:none 时量不到 → 用落盘尺寸
    const h = r.height || p.h || 0;
    if (!w && !h) return false;
    const c = clampXY(p.left, p.top, w, h);
    place(el, c);
    if (typeof b.onRestore === 'function') { try { b.onRestore(c); } catch (_) {} }
    return true;
  }

  // ---------- 拖拽 ----------

  function onDown(e, el, b) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.closest && e.target.closest(b.exclude || EXCLUDE)) return;
    const r = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = r.left;
    const startTop = r.top;
    const w = r.width;
    const h = r.height;
    let moved = false;
    let cur = { left: Math.round(startLeft), top: Math.round(startTop) };

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < MOVE_MIN) return;
      if (!moved) {
        moved = true;
        el.classList.add('dwt-dragging');
        if (typeof b.onStart === 'function') { try { b.onStart(); } catch (_) {} }
      }
      cur = clampXY(startLeft + dx, startTop + dy, w, h);
      place(el, cur);
      if (ev.cancelable) ev.preventDefault();
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      el.classList.remove('dwt-dragging');
      if (!moved) return;
      posMap[b.key] = { left: cur.left, top: cur.top, w: Math.round(w), h: Math.round(h) };
      persist(b.key);
      if (typeof b.onEnd === 'function') { try { b.onEnd(cur); } catch (_) {} }
    }

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    // 阻止拖拽时选中文字 / 触发原生图片拖拽；点击事件不受影响
    if (e.cancelable) e.preventDefault();
  }

  function attach(el, opts) {
    if (!el) return null;
    const o = opts || {};
    const key = o.key || el.id;
    if (!key) return null;
    injectStyles();
    detach(el);                       // 重注入：换掉上一实例的监听（跨实例，见 detach 注释）
    const handle = o.handle || el;
    if (handle.classList) handle.classList.add('dwt-drag-handle');
    const b = {
      key: String(key),
      handle,
      exclude: o.exclude || '',
      onRestore: o.onRestore,
      onStart: o.onStart,
      onEnd: o.onEnd,
      onDown: null,
    };
    b.onDown = (e) => onDown(e, el, b);
    handle.addEventListener('pointerdown', b.onDown);
    bound.set(el, b);
    // 绑定也挂在元素上：重注入会新建一个 drag 实例（bound 是空的），
    // 只靠实例内的 Map 摘不掉上一实例的监听 —— 两个 handler 同时拖同一元素，
    // 各自 persist 自己的 posMap，落盘值互相覆盖（真机表现为「拖完刷新又跳回旧位置」）。
    try { el.__dwtDragBound = b; } catch (_) {}
    if (o.preferSaved !== false) restore(el);   // 已加载则立即贴回；未加载由 load() 回调补
    load();
    return b;
  }

  function detach(el) {
    // 先认元素上的绑定（可能是上一实例留的），再退回本实例的 Map
    const b = (el && el.__dwtDragBound) || bound.get(el);
    if (!b) return false;
    try { b.handle.removeEventListener('pointerdown', b.onDown); } catch (_) {}
    if (b.handle.classList && b.handle.classList.contains('dwt-drag-handle')) {
      // 把手类名由本模块加，摘的时候一并去掉（面板被复用时不残留 move 光标）
      if (!b.handle.classList.contains('dwt-drag-handle-keep')) b.handle.classList.remove('dwt-drag-handle');
    }
    try { if (el && el.__dwtDragBound === b) delete el.__dwtDragBound; } catch (_) {}
    bound.delete(el);
    return true;
  }

  // 只有「当前持有该元素」的实例才动它：旧实例的 resize/load 回调不能拿旧 posMap 抢位置
  function owns(el, b) {
    return el.__dwtDragBound === b || (!el.__dwtDragBound && bound.get(el) === b);
  }

  // 视口变化：把已拖过的面板重新夹回可见范围
  window.addEventListener('resize', () => {
    bound.forEach((_b, el) => { if (el.isConnected && posMap[_b.key] && owns(el, _b)) restore(el); });
  });

  dwt.drag = {
    attach,
    detach,
    restore,
    load,
    has: (key) => !!posMap[key],
    getPos: (key) => (posMap[key] ? { ...posMap[key] } : null),
    clear(key) {
      delete posMap[key];
      persist(key);
    },
    KEY,
  };

  load();
  console.log('[cs][doubao-web-toolkit] panel-drag ready');
})();
