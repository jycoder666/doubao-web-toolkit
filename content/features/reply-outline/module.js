// reply-outline/module.js — 回复大纲（对应总表 #47 Nokic233/ai-chat-outline-extension、#48 mortal-94/AI-TOC）
// 功能: 右侧固定大纲面板 —— 取「当前视口内的那条 AI 回复」，抽取其中的 h1~h6 生成目录，
//       点击行跳转到对应小节；滚到别的回复自动重算；纯文本回复（无标题）不显示大纲。
// 实现: 纯 DOM 抽取（无网络请求、无模型调用）；豆包把 Markdown 标题渲染成真实 h1~h6，直接读 DOM 即可。
// 说明: 与 navigator（提问导航）/ chat-digest（全文摘要）互补 —— 前者管「问了什么」，
//       后者管「整段对话」，本模块只管「眼前这一条回复的结构」。无标题时不合成伪大纲。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  const KEY = 'dwt_outline';                 // 功能开关（默认开）
  const COLLAPSE_KEY = 'dwt_outline_collapsed';
  const ROOT_ID = 'dwt-outline';
  const STYLE_ID = 'dwt-outline-style';

  const AI_SEL_FALLBACK = '[class*="conversation-message-content-padding-right"]';
  const USER_SEL_FALLBACK = '[class*="bg-g-send-msg-bubble-bg"]';
  const SCROLLER_SEL = '[class*="v_list_scroller"], [class*="message-list"], [class*="scroller"]';
  const HEAD_SEL = 'h1,h2,h3,h4,h5,h6';

  const TOP_MIN = 84;      // 与 #dwt-nav 同基线
  const RIGHT_MIN = 12;    // 与 #dwt-nav 同右距
  const BOTTOM_GAP = 62;   // 底部 rail(36) + 边距，避免压住 🧰 / 快捷回复
  const MIN_PANEL_H = 190; // 导航栏下方放不下就挪到导航左侧
  const REFRESH_MS = 320;  // DOM 变更（流式输出）后的重算防抖
  const JUMP_OFFSET = 14;  // 跳转后标题距滚动容器顶部的留白

  // ⓘ 用法说明：面板标题右侧（rail 无 outline 入口，只挂在面板标题上）
  const HELP = {
    title: '📑 本回复大纲',
    desc: '给「眼前这一条」AI 回复生成目录：只看视口里可见面积最大的那条，滚到别的回复会自动重算。',
    rows: [
      ['怎么用', '点一行跳到对应小节；再点标题右侧的箭头收起 / 展开'],
      ['看的是哪条', '当前视口里可见面积最大的 AI 回复（不是整段对话）'],
      ['不显示时', '回复里没有 h1~h6 标题，或正文为空 —— 不会给你合成伪大纲'],
      ['数字徽标', '这条回复抽到的标题数'],
    ],
    note: '纯读 DOM（豆包把 Markdown 标题渲染成真实 h1~h6），不发请求、不改内容；提问导航看「问了什么」，这里只看「这条回复的结构」。',
  };

  // 跨重注入状态：DOM 会被新实例重建，但监听器/观察器的句柄要能互相清理
  const S = (window.__dwtOutlineState = window.__dwtOutlineState || {
    enabled: true, collapsed: false, moved: false,
    curNode: null, curIndex: -1, items: [], activeIdx: -1,
    mo: null, onScroll: null, scrollEl: null, raf: 0, timer: 0, busy: false,
  });

  // ---------- 基础工具 ----------

  function $(id) { return document.getElementById(id); }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // 豆包聊天区不是 window 滚动，而是内部容器 div.v_list_scroller-*（同 reading-mark）
  function getScroller() {
    if (S.scrollEl && S.scrollEl.isConnected) return S.scrollEl;
    let best = null;
    let bestArea = 0;
    document.querySelectorAll(SCROLLER_SEL).forEach((el) => {
      if (el.scrollHeight <= el.clientHeight + 20) return;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = el; }
    });
    S.scrollEl = best;
    return best;
  }

  // ---------- 样式 ----------

  function injectStyles() {
    if ($(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    // 全部走 --dwt-* 变量 + 兜底值：豆包页不加载 common.css，兜底是必需的
    st.textContent = `
#${ROOT_ID} {
  position: fixed; right: ${RIGHT_MIN}px; top: ${TOP_MIN}px; z-index: 200; width: 212px;
  max-height: 640px; display: flex; flex-direction: column; box-sizing: border-box;
  padding: 8px; border-radius: 12px; font-size: 12px; line-height: 1.35;
  color: var(--dwt-fg, #1f2328);
  background: var(--dwt-bg, rgba(255, 255, 255, 0.96));
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  border: 1px solid var(--dwt-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  transition: opacity .18s ease;
}
#${ROOT_ID}.dwt-ol-hidden { display: none !important; }
#${ROOT_ID} .dwt-ol-head {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-bottom: 6px;
}
#${ROOT_ID} .dwt-ol-title {
  font-size: 12px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
}
#${ROOT_ID} .dwt-ol-badge {
  font-size: 10px; color: var(--dwt-muted, #8b949e); padding: 0 5px; border-radius: 8px;
  border: 1px solid var(--dwt-border, #e3e6ea); white-space: nowrap;
}
#${ROOT_ID} .dwt-ol-collapse {
  margin-left: auto; cursor: pointer; border: 0; background: transparent; padding: 2px 6px;
  border-radius: 5px; color: var(--dwt-muted, #8b949e); font-size: 12px; line-height: 1;
}
#${ROOT_ID} .dwt-ol-collapse:hover { background: var(--dwt-soft, #f0f2f5); }
#${ROOT_ID} .dwt-ol-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
#${ROOT_ID} .dwt-ol-row {
  display: flex; gap: 6px; align-items: baseline; padding: 4px 6px; border-radius: 6px;
  cursor: pointer; color: var(--dwt-fg, #3a3f45);
}
#${ROOT_ID} .dwt-ol-row:hover { background: var(--dwt-soft, #f0f2f5); }
#${ROOT_ID} .dwt-ol-row.dwt-ol-active {
  background: rgba(45, 114, 222, .12); color: #2d72de; font-weight: 600;
}
#${ROOT_ID} .dwt-ol-lv {
  flex-shrink: 0; font-variant-numeric: tabular-nums; color: var(--dwt-muted, #9aa3ad);
  font-size: 10px; min-width: 12px;
}
#${ROOT_ID} .dwt-ol-row.dwt-ol-active .dwt-ol-lv { color: #2d72de; }
#${ROOT_ID} .dwt-ol-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${ROOT_ID}.dwt-ol-collapsed { width: auto; padding: 6px 8px; }
#${ROOT_ID}.dwt-ol-collapsed .dwt-ol-title,
#${ROOT_ID}.dwt-ol-collapsed .dwt-ol-badge,
#${ROOT_ID}.dwt-ol-collapsed .dwt-ol-body { display: none; }
html.dwt-ui-dark #${ROOT_ID} {
  background: var(--dwt-bg, #1f2430);
  border-color: var(--dwt-border, #3a4150);
  color: var(--dwt-fg, #e6e8ee);
}
html.dwt-ui-dark #${ROOT_ID} .dwt-ol-collapse:hover,
html.dwt-ui-dark #${ROOT_ID} .dwt-ol-row:hover { background: var(--dwt-soft, #262c38); }
html.dwt-ui-dark #${ROOT_ID} .dwt-ol-row { color: var(--dwt-fg, #cfd4dd); }
html.dwt-ui-dark #${ROOT_ID} .dwt-ol-row.dwt-ol-active { background: rgba(45, 114, 222, .22); color: #8ab4f8; }
`;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- 面板 DOM ----------

  function ensureRoot() {
    let root = $(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.className = 'dwt-ol-hidden';
      const head = document.createElement('div');
      head.className = 'dwt-ol-head';
      const title = document.createElement('span');
      title.className = 'dwt-ol-title';
      title.textContent = '📑 本回复大纲';
      const badge = document.createElement('span');
      badge.className = 'dwt-ol-badge';
      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'dwt-ol-collapse';
      collapse.title = '收起 / 展开大纲';
      collapse.addEventListener('click', () => { setCollapsed(!S.collapsed); });
      head.appendChild(title);
      head.appendChild(badge);
      head.appendChild(collapse);
      const body = document.createElement('div');
      body.className = 'dwt-ol-body';
      body.addEventListener('click', (e) => {
        const row = e.target && e.target.closest ? e.target.closest('.dwt-ol-row') : null;
        if (!row) return;
        jump(Number(row.getAttribute('data-i')));
      });
      root.appendChild(head);
      root.appendChild(body);
      (document.body || document.documentElement).appendChild(root);
    }
    // 标题右侧 ⓘ：悬停出表格化说明。挂在 head 上再挪到标题后面 ——
    // .dwt-ol-collapsed 会把 .dwt-ol-title 整个 display:none，挂在标题里一收起就点不到了。
    const helpBtn = window.dwt?.helpTip?.attach?.(root.querySelector('.dwt-ol-head'), HELP);
    if (helpBtn) head.insertBefore(helpBtn, root.querySelector('.dwt-ol-badge'));
    return root;
  }

  // ---------- 抽取 ----------

  // 当前会话里的 AI 回复正文节点（按 DOM 顺序）
  function aiReplies() {
    const sm = dwt.selectorManager;
    const aiSel = (sm && sm.getAiContent && sm.getAiContent()) || AI_SEL_FALLBACK;
    const userSel = (sm && sm.getUserBubble && sm.getUserBubble()) || USER_SEL_FALLBACK;
    const scope = (sm && sm.getMessageList && sm.getMessageList()) || document;
    const all = Array.from(scope.querySelectorAll(aiSel));
    return all.filter((n) => {
      if (!n.isConnected) return false;
      // 用户消息行也会命中该 class：行内含用户气泡的直接排除
      if (n.closest(userSel) || n.querySelector(userSel)) return false;
      if (!(n.innerText || '').trim()) return false;   // 动作条/占位空壳
      return true;
    });
  }

  // 视口内「可见面积最大」的那条回复（虚拟列表滚动时它就是要展示大纲的那条）
  function pickCurrent(list) {
    const sc = getScroller();
    const scRect = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const top = Math.max(0, scRect.top);
    const bottom = Math.min(window.innerHeight, scRect.bottom || window.innerHeight);
    let best = null;
    let bestScore = 0;
    let bestIndex = -1;
    list.forEach((n, i) => {
      const r = n.getBoundingClientRect();
      const vis = Math.min(r.bottom, bottom) - Math.max(r.top, top);
      if (vis <= 0) return;
      if (vis > bestScore) { bestScore = vis; best = n; bestIndex = i; }
    });
    return { node: best, index: bestIndex };
  }

  // 只认真实标题元素；层级按本条回复内最小级别归一（h2 开头就顶格显示）
  function extractHeads(node) {
    if (!node) return [];
    const hs = Array.from(node.querySelectorAll(HEAD_SEL));
    const items = [];
    hs.forEach((h) => {
      const text = (h.innerText || '').trim();
      if (!text) return;
      items.push({ level: Number(h.tagName.slice(1)) || 6, text: text.slice(0, 120), node: h });
    });
    if (!items.length) return [];
    const base = Math.min.apply(null, items.map((it) => it.level));
    items.forEach((it) => { it.depth = clamp(it.level - base, 0, 5); });
    return items;
  }

  // ---------- 渲染 ----------

  function render() {
    const root = ensureRoot();
    const body = root.querySelector('.dwt-ol-body');
    const badge = root.querySelector('.dwt-ol-badge');
    const collapse = root.querySelector('.dwt-ol-collapse');
    S.busy = true;
    try {
      body.textContent = '';
      S.items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'dwt-ol-row' + (i === S.activeIdx ? ' dwt-ol-active' : '');
        row.setAttribute('data-i', String(i));
        row.title = it.text;
        row.style.paddingLeft = (6 + it.depth * 12) + 'px';
        const lv = document.createElement('span');
        lv.className = 'dwt-ol-lv';
        lv.textContent = 'H' + it.level;
        const txt = document.createElement('span');
        txt.className = 'dwt-ol-txt';
        txt.textContent = it.text;
        row.appendChild(lv);
        row.appendChild(txt);
        body.appendChild(row);
      });
      badge.textContent = S.curIndex >= 0
        ? '第 ' + (S.curIndex + 1) + ' 条 · ' + S.items.length + ' 节'
        : S.items.length + ' 节';
      collapse.textContent = S.collapsed ? '◀' : '▶';
    } finally {
      S.busy = false;
    }
  }

  // 右侧占位避让：优先放在 #dwt-nav 下方；放不下就挪到它左边；原生 gutter 挪右时再让开 gutter
  function place() {
    const root = $(ROOT_ID);
    if (!root) return;
    const bottomLimit = window.innerHeight - BOTTOM_GAP;
    // 用户拖过：位置归用户（只按当前位置收 maxHeight），导航栏避让不再把面板拽回右缘
    if (S.moved) {
      const mr = root.getBoundingClientRect();
      root.style.maxHeight = Math.max(120, bottomLimit - Math.max(0, mr.top)) + 'px';
      return;
    }
    let top = TOP_MIN;
    let right = RIGHT_MIN;
    const nav = $('dwt-nav');
    if (isVisible(nav)) {
      const nr = nav.getBoundingClientRect();
      const below = bottomLimit - (nr.bottom + 10);
      if (below >= MIN_PANEL_H) {
        top = Math.round(nr.bottom + 10);
      } else {
        top = TOP_MIN;
        right = Math.round(window.innerWidth - nr.left + 10);
      }
    } else {
      const gutter = document.querySelector('aside[class*="gutter"]');
      if (gutter && isVisible(gutter)) {
        const gr = gutter.getBoundingClientRect();
        if (gr.left > window.innerWidth / 2) right = Math.round(window.innerWidth - gr.left + 8);
      }
    }
    root.style.top = top + 'px';
    root.style.right = right + 'px';
    root.style.maxHeight = Math.max(120, bottomLimit - top) + 'px';
  }

  function show(on) {
    const root = $(ROOT_ID);
    if (!root) return;
    root.classList.toggle('dwt-ol-hidden', !on);
  }

  // 滚动时高亮当前小节（最后一条「顶部已越过容器顶」的标题）
  function updateActive() {
    if (!S.items.length) return;
    const sc = getScroller();
    const scTop = sc ? sc.getBoundingClientRect().top : 0;
    let idx = 0;
    for (let i = 0; i < S.items.length; i++) {
      const h = S.items[i].node;
      if (!h || !h.isConnected) continue;
      if (h.getBoundingClientRect().top - scTop <= 28) idx = i;
      else break;
    }
    if (idx === S.activeIdx) return;
    S.activeIdx = idx;
    const body = $(ROOT_ID) && $(ROOT_ID).querySelector('.dwt-ol-body');
    if (!body) return;
    const rows = body.querySelectorAll('.dwt-ol-row');
    for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('dwt-ol-active', i === idx);
    const cur = rows[idx];
    if (cur && cur.scrollIntoView) {
      try { cur.scrollIntoView({ block: 'nearest' }); } catch (_) { /* ignore */ }
    }
  }

  // ---------- 主循环 ----------

  function refresh(reason) {
    if (!S.enabled) { show(false); return; }
    const list = aiReplies();
    const cur = pickCurrent(list);
    const changed = cur.node !== S.curNode;
    if (changed) {
      S.curNode = cur.node;
      S.curIndex = cur.index;
      S.items = extractHeads(cur.node);
      S.activeIdx = -1;
      render();
      place();
    }
    // 流式输出期间标题会陆续出现：节点没变但小节数变了也要重画
    else if (cur.node) {
      const items = extractHeads(cur.node);
      if (items.length !== S.items.length) {
        S.items = items;
        S.activeIdx = -1;
        render();
      }
    }
    show(S.items.length > 0 && !!S.curNode);
    if (S.items.length) updateActive();
    void reason;
  }

  function scheduleRefresh() {
    if (S.timer) return;
    S.timer = setTimeout(() => { S.timer = 0; refresh('debounce'); }, REFRESH_MS);
  }

  function onScroll() {
    if (S.raf) return;
    S.raf = requestAnimationFrame(() => {
      S.raf = 0;
      refresh('scroll');
    });
  }

  function bind() {
    // 重注入时先卸掉上一个实例的监听/观察（句柄存在共享 state 上）
    if (S.mo) { try { S.mo.disconnect(); } catch (_) {} S.mo = null; }
    if (S.onScroll) {
      try { window.removeEventListener('scroll', S.onScroll, true); } catch (_) {}
      if (S.boundEl) { try { S.boundEl.removeEventListener('scroll', S.onScroll, true); } catch (_) {} }
      S.onScroll = null;
    }
    S.onScroll = onScroll;
    window.addEventListener('scroll', S.onScroll, true);
    const sc = getScroller();
    if (sc) { S.boundEl = sc; sc.addEventListener('scroll', S.onScroll, { passive: true }); }

    if (typeof MutationObserver === 'function') {
      const sm = dwt.selectorManager;
      const scope = (sm && sm.getMessageList && sm.getMessageList()) || document.body || document.documentElement;
      const mo = new MutationObserver((records) => {
        if (S.busy) return;
        for (let i = 0; i < records.length; i++) {
          const t = records[i].target;
          if (t && t.nodeType === 1 && t.closest && t.closest('#' + ROOT_ID)) return;
        }
        scheduleRefresh();
      });
      try { mo.observe(scope, { childList: true, subtree: true, characterData: true }); } catch (_) {}
      S.mo = mo;
    }

    if (!window.__dwtOutlineDoc) {
      window.__dwtOutlineDoc = true;
      window.addEventListener('resize', () => { place(); });
      // SPA 切会话：列表整体换血，靠 MutationObserver 已能覆盖；这里补一次路由变化后的重算
      window.addEventListener('popstate', () => scheduleRefresh());
    }
  }

  // ---------- 存储 ----------

  async function load() {
    try {
      const r = await chrome.storage.local.get([KEY, COLLAPSE_KEY]);
      S.enabled = r[KEY] !== false;          // 默认开
      S.collapsed = r[COLLAPSE_KEY] === true;
    } catch (_) { /* 用默认值 */ }
    const root = ensureRoot();
    root.classList.toggle('dwt-ol-collapsed', !!S.collapsed);
  }

  async function save() {
    try { await chrome.storage.local.set({ [KEY]: S.enabled, [COLLAPSE_KEY]: S.collapsed }); } catch (_) {}
  }

  // ---------- 对外行为 ----------

  function setCollapsed(v) {
    S.collapsed = !!v;
    const root = $(ROOT_ID);
    if (root) {
      root.classList.toggle('dwt-ol-collapsed', S.collapsed);
      const btn = root.querySelector('.dwt-ol-collapse');
      if (btn) btn.textContent = S.collapsed ? '◀' : '▶';
    }
    if (!S.collapsed) place();
    save();
  }

  function setEnabled(v) {
    S.enabled = v !== false;
    if (!S.enabled) show(false);
    else refresh('enable');
    save();
  }

  function jump(i) {
    const it = S.items[i];
    if (!it) return false;
    const head = it.node;
    if (!head || !head.isConnected) { refresh('jump-stale'); return false; }
    const sc = getScroller();
    if (sc) {
      const scRect = sc.getBoundingClientRect();
      const hRect = head.getBoundingClientRect();
      const target = clamp(sc.scrollTop + (hRect.top - scRect.top) - JUMP_OFFSET, 0, sc.scrollHeight);
      try { sc.scrollTo({ top: target, behavior: 'smooth' }); }
      catch (_) { sc.scrollTop = target; }
    } else {
      try { head.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {}
    }
    S.activeIdx = i;
    const body = $(ROOT_ID) && $(ROOT_ID).querySelector('.dwt-ol-body');
    if (body) {
      const rows = body.querySelectorAll('.dwt-ol-row');
      for (let k = 0; k < rows.length; k++) rows[k].classList.toggle('dwt-ol-active', k === i);
    }
    return true;
  }

  async function mount() {
    injectStyles();
    ensureRoot();
    // 拖拽：面板头为把手。拖过之后 place() 不再改位置（S.moved），重注入按落盘位置还原
    const root = $(ROOT_ID);
    window.dwt?.drag?.attach?.(root, {
      key: 'outline',
      handle: root.querySelector('.dwt-ol-head'),
      onRestore: () => { S.moved = true; },
      onEnd: () => { S.moved = true; },
    });
    await load();
    bind();
    refresh('mount');
    // 首屏 DOM 可能还没渲染完（SPA），补两次延时重算
    setTimeout(() => refresh('late-1'), 900);
    setTimeout(() => refresh('late-2'), 2600);
  }

  // ---------- API ----------

  dwt.replyOutlineModule = {
    mount,
    refresh,
    setEnabled,
    isEnabled: () => S.enabled,
    setCollapsed,
    isCollapsed: () => S.collapsed,
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
    jump,
    getItems: () => S.items.map((it) => ({ level: it.level, depth: it.depth, text: it.text })),
    getCurrentIndex: () => S.curIndex,
    isVisible: () => { const r = $(ROOT_ID); return !!(r && !r.classList.contains('dwt-ol-hidden')); },
    ROOT_ID,
    KEY,
  };

  mount().then(() => {
    console.log('[cs][doubao-web-toolkit] reply-outline ready');
  }).catch(() => {
    console.log('[cs][doubao-web-toolkit] reply-outline ready (degraded)');
  });
})();
