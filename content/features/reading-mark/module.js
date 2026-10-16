// reading-mark/module.js — 阅读位置标记（对应总表 #108 yongshen315/doubao-reading-mark）
// 功能: 记录每个会话的阅读位置(滚动进度 + 已读消息锚点), 再次打开同一会话时提示并一键跳回。
// 实现: 纯 DOM + chrome.storage.local, 按会话 id 存锚点; 不发任何网络请求。
// 说明: 锚点用「消息序号 + 文本指纹」双重定位, 避免豆包重渲染导致节点失效。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_reading_mark';       // 功能开关
  const STORE_KEY = 'dwt_reading_pos';  // { [convId]: { idx, hash, scrollTop, ts } }
  const BADGE_ID = 'dwt-readmark-badge';

  let enabled = true;
  let store = {};
  let convId = '';
  let saveTimer = null;
  let lastPromptedConv = '';

  // ---------- 工具 ----------

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // 从 URL 取会话 id: /chat/(\d+)
  function getConvId() {
    const m = (location.pathname || '').match(/\/chat\/(\d+)/);
    return m ? m[1] : '';
  }

  // 简易字符串指纹 (djb2), 用于校验锚点文本是否一致
  function hashText(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // 收集当前会话的「用户提问」节点 (与 navigator 一致的消息定位方式)
  function getUserNodes() {
    return Array.from(document.querySelectorAll('[class*="bg-g-send-msg-bubble-bg"]'));
  }

  // ---------- 存储 ----------

  async function loadStore() {
    try {
      const r = await chrome.storage.local.get(STORE_KEY);
      store = r[STORE_KEY] || {};
    } catch (_) { store = {}; }
  }

  async function persist() {
    try { await chrome.storage.local.set({ [STORE_KEY]: store }); } catch (_) {}
  }

  // ---------- 记录阅读位置 ----------

  // 找到「当前视口内最靠上、且已完整可见」的用户消息, 作为锚点
  function pickAnchor() {
    const nodes = getUserNodes();
    if (!nodes.length) return null;
    let best = null;
    for (let i = 0; i < nodes.length; i++) {
      const r = nodes[i].getBoundingClientRect();
      // 视口内 (留 80px 容差)
      if (r.top >= -80 && r.top <= window.innerHeight) {
        const text = (nodes[i].innerText || '').trim();
        if (text) { best = { idx: i, hash: hashText(text), scrollTop: window.scrollY, ts: Date.now() }; break; }
      }
    }
    // 视口内没有消息 (例如停在底部) → 记最后一个
    if (!best) {
      const last = nodes[nodes.length - 1];
      const text = (last.innerText || '').trim();
      best = { idx: nodes.length - 1, hash: hashText(text), scrollTop: window.scrollY, ts: Date.now() };
    }
    return best;
  }

  function scheduleSave() {
    if (!enabled || !convId) return;
    if (saveTimer) return;
    // 500ms 防抖, 避免滚动高频写 storage
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const anchor = pickAnchor();
      if (!anchor) return;
      store[convId] = anchor;
      persist();
    }, 500);
  }

  // ---------- 恢复阅读位置 ----------

  // 按锚点 (idx + hash) 找到目标节点, 返回节点或 null
  function resolveAnchor(anchor) {
    const nodes = getUserNodes();
    if (!nodes.length) return null;
    // 优先: 同序号 + 同指纹
    if (nodes[anchor.idx]) {
      const t = (nodes[anchor.idx].innerText || '').trim();
      if (hashText(t) === anchor.hash) return nodes[anchor.idx];
    }
    // 兜底: 全文匹配指纹
    for (const n of nodes) {
      if (hashText((n.innerText || '').trim()) === anchor.hash) return n;
    }
    // 再兜底: 同序号
    return nodes[anchor.idx] || null;
  }

  // 顶部提示条: 「上次读到第 N 条」+ 跳转 / 关闭
  function showResumeTip(anchor) {
    const old = document.getElementById(BADGE_ID);
    if (old) old.remove();
    const tip = document.createElement('div');
    tip.id = BADGE_ID;
    tip.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:999999;'
      + 'background:#1f6feb;color:#fff;border-radius:8px;padding:8px 12px;font-size:12px;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;';
    tip.innerHTML = '<span>📌 上次读到第 ' + (anchor.idx + 1) + ' 条</span>'
      + '<button id="dwt-readmark-go" style="border:0;border-radius:5px;padding:3px 8px;cursor:pointer;'
      + 'background:#fff;color:#1f6feb;font-size:12px;">跳转</button>'
      + '<button id="dwt-readmark-close" style="border:0;background:transparent;color:#fff;cursor:pointer;'
      + 'font-size:14px;line-height:1;">×</button>';
    document.body.appendChild(tip);
    tip.querySelector('#dwt-readmark-go').onclick = () => {
      const node = resolveAnchor(anchor);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node.style.outline = '2px solid #1f6feb';
        setTimeout(() => { node.style.outline = ''; }, 1500);
      }
      tip.remove();
    };
    tip.querySelector('#dwt-readmark-close').onclick = () => tip.remove();
    // 12 秒后自动淡出
    setTimeout(() => { if (tip.parentElement) tip.remove(); }, 12000);
  }

  // 进入会话后: 若存在锚点则提示恢复
  async function tryResume() {
    if (!enabled) return;
    const id = getConvId();
    if (!id || id === lastPromptedConv) return;
    lastPromptedConv = id;
    const anchor = store[id];
    if (!anchor) return;
    // 等消息渲染
    for (let i = 0; i < 10; i++) {
      if (getUserNodes().length) break;
      await sleep(500);
    }
    if (!getUserNodes().length) return;
    // 若已经在锚点附近 (±120px) 则不打扰
    const node = resolveAnchor(anchor);
    if (node) {
      const top = node.getBoundingClientRect().top;
      if (top >= -80 && top <= 160) return;
    }
    showResumeTip(anchor);
  }

  // ---------- 会话切换监听 ----------

  function watchRouteChange() {
    let lastHref = location.href;
    setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      const id = getConvId();
      if (id && id !== convId) {
        // 切换会话前先保存旧会话位置
        const anchor = pickAnchor();
        if (convId && anchor) { store[convId] = anchor; persist(); }
        convId = id;
        lastPromptedConv = '';
        tryResume();
      }
    }, 1000);
  }

  // ---------- 主流程 ----------

  function bindScroll() {
    window.addEventListener('scroll', scheduleSave, { passive: true });
    // 页面隐藏/卸载时立即落盘
    window.addEventListener('beforeunload', () => {
      const anchor = pickAnchor();
      if (convId && anchor) { store[convId] = anchor; persist(); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const anchor = pickAnchor();
        if (convId && anchor) { store[convId] = anchor; persist(); }
      }
    });
  }

  function mount() {
    if (!enabled) return;
    convId = getConvId();
    bindScroll();
    watchRouteChange();
    if (convId) tryResume();
    console.log('[dwt-reading-mark] mounted, conv=', convId);
  }

  async function loadConfig() {
    try {
      const r = await chrome.storage.local.get(KEY);
      enabled = r[KEY] !== false; // 默认开启
    } catch (_) { enabled = true; }
  }

  dwt.readingMarkModule = {
    mount,
    getConvId,
    getAnchor: (id) => store[id || convId] || null,
    clearAnchor(id) { delete store[id || convId]; return persist(); },
    setEnabled(v) { enabled = !!v; },
    isEnabled: () => enabled,
  };

  // 先读配置 + 存储, 再挂载
  Promise.all([loadConfig(), loadStore()]).then(mount);

  console.log('[doubao-web-toolkit] reading-mark module ready');
})();
