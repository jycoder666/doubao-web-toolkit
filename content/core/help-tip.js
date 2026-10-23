// help-tip.js — 统一「ⓘ 用法说明」：面板标题右侧 / rail 菜单行标题右侧挂一个小圆图标，
// 鼠标滑过（或键盘聚焦）即弹出表格化说明，点击钉住，Esc / 点外部关闭。
//
// 用法: window.dwt.helpTip.attach(anchorEl, spec)
//   spec = {
//     title: '✨ 视觉关键词',            // 卡片标题
//     desc:  '一句话作用',               // 可选，标题下的一段
//     rows:  [['怎么用', '...'], ...],    // 键值表格行（值里可用 \n 换行）
//     sections: [{ h: '分节标题', rows: [...] }],  // 可选，多分节
//     note:  '补充说明',                  // 可选，脚注
//     width: 320,                        // 可选，卡片固定宽度（仍会夹进视口）
//   }
//
// 约束: 内容一律走 textContent（不拼 innerHTML）; 卡片固定定位并夹在视口内;
//       同一锚点幂等（重复 attach 只留一个图标，spec 取最后一次）; 单卡片复用。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const STYLE_ID = 'dwt-help-tip-style';
  const CARD_ID = 'dwt-help-tip-card';
  const BTN_CLASS = 'dwt-help-btn';
  const ON_CLASS = 'dwt-ht-on';
  const SHOW_DELAY = 120; // 滑过不立刻弹，避免扫过时闪
  const HIDE_DELAY = 260; // 留出从图标移到卡片上的时间
  const MARGIN = 8;

  let card = null;
  let anchorEl = null;
  let lastSpec = null;
  let pinned = false;
  let overCard = false;
  let showTimer = 0;
  let hideTimer = 0;
  let globalsBound = false;

  function injectStyles() {
    // 热更新：清掉旧样式再写，保证各面板 ⓘ 视觉与语料板一致
    document.querySelectorAll('style#' + STYLE_ID).forEach((n) => n.remove());
    const st = document.createElement('style');
    st.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(st);
    st.textContent = `
      /* 统一提示钮：与语料板一致的蓝色圆「i」，压过宿主 button / 父级 b 加粗 */
      .${BTN_CLASS} {
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        width: 14px !important; height: 14px !important; margin: 0 0 0 5px !important; padding: 0 !important;
        border: 1px solid var(--dwt-accent, #2d72de) !important; border-radius: 50% !important;
        background: transparent !important; color: var(--dwt-accent, #2d72de) !important;
        font: italic 600 10px/1 ui-sans-serif, system-ui, sans-serif !important;
        font-style: italic !important; font-weight: 600 !important; font-size: 10px !important;
        cursor: help !important; vertical-align: middle !important; flex: none !important;
        box-sizing: border-box !important; min-width: 0 !important; min-height: 0 !important;
        max-width: 14px !important; max-height: 14px !important; line-height: 1 !important;
        pointer-events: auto !important; text-transform: none !important; letter-spacing: 0 !important;
        box-shadow: none !important; outline: none !important;
      }
      .${BTN_CLASS}:hover, .${BTN_CLASS}:focus-visible, .${BTN_CLASS}.${ON_CLASS} {
        border-color: #4b8bf5 !important; color: #4b8bf5 !important;
        background: rgba(45, 114, 222, 0.12) !important;
      }
      #${CARD_ID} {
        position: fixed; z-index: 1000000; display: none;
        max-width: min(420px, calc(100vw - 16px)); max-height: 70vh; overflow: auto;
        background: var(--dwt-bg, #fff); color: var(--dwt-fg, #1f2328);
        border: 1px solid var(--dwt-border, #d0d7de); border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 10px 12px;
        font: 12px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        box-sizing: border-box;
      }
      #${CARD_ID} .dwt-ht-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
      #${CARD_ID} .dwt-ht-desc { color: var(--dwt-muted, #57606a); margin-bottom: 6px; }
      #${CARD_ID} .dwt-ht-sec {
        font-weight: 600; color: var(--dwt-accent, #2d72de);
        background: var(--dwt-soft, #f6f8fa); border-radius: 6px;
        padding: 3px 6px; margin: 8px 0 4px;
      }
      #${CARD_ID} table { width: 100%; border-collapse: collapse; }
      #${CARD_ID} td { vertical-align: top; padding: 3px 0; border-top: 1px solid var(--dwt-border, #eaeef2); }
      #${CARD_ID} tbody tr:first-child td { border-top: 0; }
      #${CARD_ID} td.k { white-space: nowrap; color: var(--dwt-muted, #57606a); padding-right: 10px; }
      #${CARD_ID} td.v { white-space: pre-line; word-break: break-word; }
      #${CARD_ID} .dwt-ht-note { margin-top: 8px; color: var(--dwt-muted, #8b949e); font-size: 11px; }
      html.dwt-ui-dark #${CARD_ID} .dwt-ht-sec { color: #7fb0ff; }
    `;
  }

  // 卡片是按 id 复用的 DOM：重注入时新实例必须先认领页面里已有的那张，否则每注入一次就多一张
  // （真机实测 cardCount:2 —— getElementById 命中的是旧的废卡，悬停看着像「没反应」，其实新实例
  // 的卡正在显示，白追了一轮）。
  // 认领同时打身份牌：旧实例的 document 监听与定时器都还活着，不过牌一律 no-op，
  // 免得旧实例把新实例正显示的卡片关掉（同 panel-drag 的 owns）。
  const INSTANCE = {};
  function owns() { return !!card && card.__dwtHelpOwner === INSTANCE; }

  function bindCard(el) {
    // 认领时摘掉上一任的卡片监听：只加不摘，反复重注入会在同一张卡上叠监听
    if (el.__dwtHelpCardOff) { try { el.__dwtHelpCardOff(); } catch (_) { /* 忽略 */ } }
    const onEnter = () => {
      if (!owns()) return;
      overCard = true;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    };
    const onLeave = () => {
      if (!owns()) return;
      overCard = false;
      if (!pinned) scheduleHide(140);
    };
    el.__dwtHelpCardOff = () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.__dwtHelpOwner = INSTANCE;
  }

  function ensureCard() {
    if (card && card.isConnected && owns()) return card;
    injectStyles();
    const found = document.getElementById(CARD_ID);
    if (found) {
      card = found;
      bindCard(found);
      return found;
    }
    card = document.createElement('div');
    card.id = CARD_ID;
    card.setAttribute('role', 'tooltip');
    bindCard(card);
    (document.body || document.documentElement).appendChild(card);
    return card;
  }

  function tableOf(rows) {
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    (rows || []).forEach((pair) => {
      if (!pair) return;
      const tr = document.createElement('tr');
      const k = document.createElement('td');
      k.className = 'k';
      k.textContent = pair[0] == null ? '' : String(pair[0]);
      const v = document.createElement('td');
      v.className = 'v';
      v.textContent = pair[1] == null ? '' : String(pair[1]);
      tr.appendChild(k);
      tr.appendChild(v);
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function render(spec) {
    const c = ensureCard();
    c.innerHTML = ''; // 只清结构；所有文本一律 textContent 写入
    const title = document.createElement('div');
    title.className = 'dwt-ht-title';
    title.textContent = spec.title || '';
    c.appendChild(title);
    if (spec.desc) {
      const d = document.createElement('div');
      d.className = 'dwt-ht-desc';
      d.textContent = String(spec.desc);
      c.appendChild(d);
    }
    if (spec.rows && spec.rows.length) c.appendChild(tableOf(spec.rows));
    (spec.sections || []).forEach((sec) => {
      if (!sec) return;
      const h = document.createElement('div');
      h.className = 'dwt-ht-sec';
      h.textContent = sec.h || '';
      c.appendChild(h);
      if (sec.rows && sec.rows.length) c.appendChild(tableOf(sec.rows));
    });
    if (spec.note) {
      const n = document.createElement('div');
      n.className = 'dwt-ht-note';
      n.textContent = String(spec.note);
      c.appendChild(n);
    }
    c.style.width = spec.width ? Math.round(Number(spec.width)) + 'px' : '';
  }

  // 贴图标下方；下方放不下就翻到上方；左右夹进视口。
  // 两侧都放不下时（长说明，如语料板 6 节 37 行 ≈ 406px）不能再往视口里硬塞：旧兜底会把卡片
  // 停在锚点正上方，卡片自己盖住 ⓘ —— 鼠标一进图标就被卡片接走，点击钉住永远打不到按钮
  // （真机实测：悬停能弹、点不着、isPinned() 一直是 false）。
  // 改为挑空间大的一侧贴边，并按该侧可用高度收口（卡片本身 overflow:auto）。
  function place() {
    if (!owns()) return false; // 不是本实例的卡就别摆（旧实例的 scroll 监听还在跑）
    if (!card || !anchorEl || !anchorEl.isConnected) return false;
    const r = anchorEl.getBoundingClientRect();
    const cw = card.offsetWidth || 320;
    card.style.maxHeight = ''; // 先解掉上一轮的收口再量，否则量到的是被夹过的高度
    const ch = card.offsetHeight || 120;
    const left = Math.min(Math.max(MARGIN, r.left - 4), Math.max(MARGIN, window.innerWidth - cw - MARGIN));
    let top = r.bottom + 6;
    let avail = window.innerHeight - MARGIN - top;
    if (ch > avail) {
      const roomAbove = r.top - 6 - MARGIN;
      if (r.top - 6 - ch >= MARGIN) {
        top = r.top - 6 - ch; // 上方完整放得下
        avail = roomAbove;
      } else if (roomAbove > avail) {
        top = MARGIN; // 上方更宽敞：贴顶 + 收口
        avail = roomAbove;
      } else {
        avail = Math.max(120, avail); // 下方更宽敞：至少留出可视高度
      }
    }
    card.style.maxHeight = Math.round(Math.min(avail, window.innerHeight * 0.7)) + 'px';
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';
    return true;
  }

  function close() {
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    // 共享卡片上只动自己的：旧实例的定时器/点外部监听都还在，不判归属就会把新实例正显示的卡关掉
    if (owns()) {
      card.style.display = 'none';
      if (anchorEl && anchorEl.classList) anchorEl.classList.remove(ON_CLASS);
    }
    anchorEl = null;
    pinned = false;
    overCard = false;
  }

  function show(a, spec) {
    if (!a || !a.isConnected || !spec) return false;
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    anchorEl = a;
    if (lastSpec !== spec) {
      render(spec);
      lastSpec = spec;
    }
    const c = ensureCard();
    // 先隐身量尺寸再落位，避免在旧位置闪一帧
    c.style.visibility = 'hidden';
    c.style.display = 'block';
    place();
    c.style.visibility = 'visible';
    if (a.classList) a.classList.add(ON_CLASS);
    try { a.setAttribute('aria-describedby', CARD_ID); } catch (_) { /* 忽略 */ }
    return true;
  }

  function scheduleShow(a, spec, delay) {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    if (!delay) { show(a, spec); return; }
    showTimer = setTimeout(() => { showTimer = 0; show(a, spec); }, delay);
  }

  function scheduleHide(delay) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      if (!pinned && !overCard) close();
    }, delay);
  }

  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;
    document.addEventListener('click', (e) => {
      if (!card || card.style.display === 'none') return;
      const t = e.target;
      if (t && t.closest && (t.closest('#' + CARD_ID) || t.closest('.' + BTN_CLASS))) return;
      close();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && card && card.style.display !== 'none') close();
    }, true);
    const replace = () => { if (card && card.style.display !== 'none') place(); };
    window.addEventListener('scroll', replace, true);
    window.addEventListener('resize', replace);
  }

  // 监听必须能重挂：面板重注入走 cloneNode(true) 甩旧监听（语料板 hot-reload 分支就是这样），
  // clone 出来的图标只剩元素本身 —— 没有监听、也没有 expando 标记。复用分支若只换 spec 不重挂，
  // 图标就成了「有说明、悬停没反应」的死按钮（真机 A/B 实测：fresh 注入可弹卡，重注入后
  // 同一个 mouseenter 卡片停在 display:none）。
  // 标记记在元素上（同 panel-drag 的 __dwtDragBound）：clone 会丢 → 重挂一次，且只重挂一次。
  function bindBtn(btn, a) {
    if (btn.__dwtHelpBound) return;
    btn.__dwtHelpBound = true;
    btn.addEventListener('mouseenter', () => scheduleShow(a, btn.__dwtHelpSpec, SHOW_DELAY));
    btn.addEventListener('mouseleave', () => scheduleHide(HIDE_DELAY));
    btn.addEventListener('focus', () => scheduleShow(a, btn.__dwtHelpSpec, 0));
    btn.addEventListener('blur', () => scheduleHide(HIDE_DELAY));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pinned && anchorEl === a) { close(); return; }
      pinned = true;
      show(a, btn.__dwtHelpSpec);
    });
  }

  function attach(a, spec) {
    if (!a || !spec || !a.appendChild) return null;
    bindGlobals();
    injectStyles(); // 必须在这里就位：卡片没弹过时 ensureCard 还没跑，图标会退回 UA 方块按钮（实测 19×21）
    const old = a.querySelector ? a.querySelector(':scope > .' + BTN_CLASS) : null;
    if (old) {
      // 幂等：同锚点只留一个图标；spec 换成最后一次给的，监听按标记补挂（clone 过的图标已丢）
      old.__dwtHelpSpec = spec;
      old.className = BTN_CLASS;
      old.textContent = 'i';
      old.setAttribute('aria-label', '用法说明');
      bindBtn(old, a);
      return old;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.textContent = 'i';
    btn.setAttribute('aria-label', '用法说明');
    btn.__dwtHelpSpec = spec;
    bindBtn(btn, a);
    a.appendChild(btn);
    return btn;
  }

  function detach(a) {
    if (!a) return;
    const btn = a.querySelector ? a.querySelector(':scope > .' + BTN_CLASS) : null;
    if (btn) btn.remove();
    if (anchorEl === a) close();
  }

  dwt.helpTip = {
    attach,
    detach,
    show,
    hide: close,
    isPinned: () => pinned,
    CARD_ID,
    BTN_CLASS,
  };
})();
