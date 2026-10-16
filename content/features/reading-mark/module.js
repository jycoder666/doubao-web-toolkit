// reading-mark/module.js — 阅读位置标记（对应总表 #108 yongshen315/doubao-reading-mark）
// 功能: 记录每个会话的阅读位置(已读消息锚点 + 视口内相对偏移), 再次打开同一会话时提示并一键跳回。
// 实现: 纯 DOM + chrome.storage.local, 按会话 id 存锚点; 不发任何网络请求。
// 说明: 锚点用「消息序号 + 文本指纹」双重定位, 避免豆包重渲染导致节点失效。
// 关键: 豆包聊天区不是 window 滚动, 而是内部容器 div.v_list_scroller-*, 必须监听该容器,
//       否则 window.scrollY 恒为 0, 无法判断真实阅读位置 → 提示条反复弹出。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_reading_mark';       // 功能开关
  const STORE_KEY = 'dwt_reading_pos';  // { [convId]: { idx, hash, offset, ts } }
  const BADGE_ID = 'dwt-readmark-badge';
  const SCROLLER_SEL = '[class*="v_list_scroller"], [class*="message-list"], [class*="scroller"]';

  let enabled = true;
  let store = {};
  let convId = '';
  let saveTimer = null;
  let lastPromptedConv = '';
  let scroller = null;      // 实际滚动容器
  let boundScrollEl = null; // 已绑定 scroll 的容器 (用于幂等重绑)

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

  // 获取豆包聊天区的真实滚动容器 (优先 v_list_scroller; 取可滚动且面积最大者)
  function getScroller() {
    if (scroller && scroller.isConnected) return scroller;
    let best = null;
    let bestArea = 0;
    document.querySelectorAll(SCROLLER_SEL).forEach((el) => {
      if (el.scrollHeight <= el.clientHeight + 20) return;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = el; }
    });
    scroller = best;
    return scroller;
  }

  // 找到「当前视口内最靠上、且已可见」的用户消息, 作为锚点。
  // offset = 该消息顶部相对滚动容器视口顶部的偏移 (恢复时据此还原到同一视觉位置)。
  function pickAnchor() {
    const nodes = getUserNodes();
    if (!nodes.length) return null;
    const sc = getScroller();
    const viewH = sc ? sc.clientHeight : window.innerHeight;
    const viewTop = sc ? sc.getBoundingClientRect().top : 0;
    // 视口内 (相对容器视口, 留 40px 容差)
    for (let i = 0; i < nodes.length; i++) {
      const r = nodes[i].getBoundingClientRect();
      const rel = r.top - viewTop;   // 相对容器视口顶部的偏移
      if (rel >= -40 && rel <= viewH) {
        const text = (nodes[i].innerText || '').trim();
        if (text) return { idx: i, hash: hashText(text), offset: Math.round(rel), ts: Date.now() };
      }
    }
    // 容器视口内没有消息 → 取最后一条
    const last = nodes[nodes.length - 1];
    const text = (last.innerText || '').trim();
    if (!text) return null;
    const rel = Math.round(last.getBoundingClientRect().top - viewTop);
    return { idx: nodes.length - 1, hash: hashText(text), offset: rel, ts: Date.now() };
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

  // 判断节点是否为当前阅读位置: 节点须在滚动容器视口内, 且相对偏移与记录值接近 (±160px)
  function isAtAnchor(node, anchor) {
    if (!node) return false;
    const sc = getScroller();
    const viewH = sc ? sc.clientHeight : window.innerHeight;
    const viewTop = sc ? sc.getBoundingClientRect().top : 0;
    const rel = node.getBoundingClientRect().top - viewTop;
    if (rel < -40 || rel > viewH) return false;
    const want = (anchor && typeof anchor.offset === 'number') ? anchor.offset : null;
    if (want === null) return true;   // 旧数据无 offset → 只要可见即视为已在锚点
    return Math.abs(rel - want) <= 160;
  }

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

  // 把锚点消息滚动到容器视口内的原相对位置 (offset), 并短暂高亮
  function scrollToAnchor(node, anchor) {
    const sc = getScroller();
    const want = (anchor && typeof anchor.offset === 'number') ? anchor.offset : 120;
    if (sc) {
      const delta = node.getBoundingClientRect().top - sc.getBoundingClientRect().top - want;
      sc.scrollTo({ top: sc.scrollTop + delta, behavior: 'smooth' });
    } else {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    node.style.outline = '2px solid #1f6feb';
    setTimeout(() => { node.style.outline = ''; }, 1500);
  }

  // 顶部提示条: 「上次读到第 N 条」+「跳回该条」/「×」
  // 关键: 用户点「跳回该条」或「×」即视为已处理, 必须把最新阅读位置落盘,
  // 否则刷新后旧锚点仍在 → 提示条反复弹出 (历史 bug)。
  function showResumeTip(anchor) {
    const old = document.getElementById(BADGE_ID);
    if (old) old.remove();
    const tip = document.createElement('div');
    tip.id = BADGE_ID;
    tip.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:999999;'
      + 'background:#1f6feb;color:#fff;border-radius:8px;padding:8px 12px;font-size:12px;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;';
    tip.innerHTML = '<span>\u{1F4CC} 上次读到第 ' + (anchor.idx + 1) + ' 条</span>'
      + '<button id="dwt-readmark-go" title="跳回上次阅读的那条消息" style="border:0;border-radius:5px;'
      + 'padding:3px 8px;cursor:pointer;background:#fff;color:#1f6feb;font-size:12px;">跳回该条</button>'
      + '<button id="dwt-readmark-close" title="关闭提示, 并按当前位置继续记录" style="border:0;'
      + 'background:transparent;color:#fff;cursor:pointer;font-size:14px;line-height:1;">×</button>';
    document.body.appendChild(tip);

    // 提示条已展示 → 立即把锚点更新为当前阅读位置, 保证刷新后不再重复提示
    if (convId) { store[convId] = anchor; persist(); }

    // 跳回该条: 滚动容器到锚点并高亮; 之后锚点即为该条
    tip.querySelector('#dwt-readmark-go').onclick = () => {
      const node = resolveAnchor(anchor);
      if (node) scrollToAnchor(node, anchor);
      if (convId) { store[convId] = anchor; persist(); }
      tip.remove();
    };

    // 关闭: 按用户当前真实位置继续记录 (用户已看到提示并选择忽略)
    tip.querySelector('#dwt-readmark-close').onclick = () => {
      const cur = pickAnchor();
      if (convId && cur) { store[convId] = cur; persist(); }
      tip.remove();
    };

    // 12 秒后自动淡出: 同样按当前真实位置落盘, 避免刷新后再次弹出
    setTimeout(() => {
      if (!tip.parentElement) return;
      const cur = pickAnchor();
      if (convId && cur) { store[convId] = cur; persist(); }
      tip.remove();
    }, 12000);
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
    // 若当前阅读位置已在锚点附近, 说明无需恢复 → 顺带把锚点刷新为当前位置后静默
    const node = resolveAnchor(anchor);
    if (isAtAnchor(node, anchor)) {
      const cur = pickAnchor();
      if (cur) { store[id] = cur; persist(); }
      return;
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
        scroller = null;      // 容器可能随会话重渲染, 清缓存以便重新探测
        lastPromptedConv = '';
        tryResume();
      }
    }, 1000);
  }

  // ---------- 主流程 ----------

  function bindScroll() {
    // 豆包聊天区滚动发生在内部容器上, 需绑定到该容器; 容器可能延迟渲染/被替换, 故定期幂等重绑。
    const attach = () => {
      const sc = getScroller();
      if (!sc || sc === boundScrollEl) return;
      if (boundScrollEl) boundScrollEl.removeEventListener('scroll', scheduleSave);
      sc.addEventListener('scroll', scheduleSave, { passive: true });
      boundScrollEl = sc;
    };
    attach();
    setInterval(attach, 2000);
    // 兜底: 部分场景仍走 window 滚动
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
    console.log('[cs][dwt-reading-mark] mounted, conv=', convId);
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
    // 立即按当前位置落盘 (供调试/测试用)
    saveNow() { const a = pickAnchor(); if (convId && a) { store[convId] = a; persist(); } return a; },
    clearAnchor(id) { delete store[id || convId]; return persist(); },
    setEnabled(v) { enabled = !!v; },
    isEnabled: () => enabled,
  };

  // 先读配置 + 存储, 再挂载
  Promise.all([loadConfig(), loadStore()]).then(mount);

  console.log('[cs][doubao-web-toolkit] reading-mark module ready');
})();
