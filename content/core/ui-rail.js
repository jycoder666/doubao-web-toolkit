// ui-rail.js — 统一右侧工具栏 (dwt rail)
// 一个主按钮收纳所有功能入口: 点击展开纵向菜单, 再点图标执行; 点击菜单外自动收起。
// 模块通过 window.dwt.rail.add({ id, domId, icon, title, order, onClick, keepMenuOpen }) 注册;
// domId 用于保留历史元素 id (如 dwt-panel-toggle / dwt-snip-toggle, live-boot 验收依赖)。
// 样式走 common.css 的 --dwt-* 变量, html.dwt-ui-dark 下自动深色。
(function () {
  'use strict';

  const dwt = (window.dwt = window.dwt || {});
  const MAIN_ID = 'dwt-rail-main';
  const MENU_ID = 'dwt-rail-menu';
  const STYLE_ID = 'dwt-rail-style';

  const items = new Map(); // id -> { def, el }
  // 模块自带整行 DOM 的入口（如 vibe 的预设色板）：render() 会 innerHTML='' 重建菜单，
  // 这些行必须补回，否则任何一次 add/remove 都会把它们冲掉。
  const customRows = new Map(); // id -> el
  // 挂在某个入口按钮左侧的悬停托盘（从右往左滑出）；同样要扛住 render 重建。
  const trays = new Map(); // itemId -> el
  let expanded = false;
  // 重注入（live-boot / 扩展 reload）后 window.dwt 与 rail 实例是新的，但 DOM 还在：
  // 若模块因「DOM 已存在」提前 return，入口会整条消失 → 把 def 存到 window 上，boot 时补回。
  const defs = (window.__dwtRailDefs = window.__dwtRailDefs || {});

  function injectStyles() {
    // 热更新：清掉同 id 残留（可能叠了多份旧样式），再写一份新的
    document.querySelectorAll('style#' + STYLE_ID).forEach((n) => n.remove());
    const st = document.createElement('style');
    st.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(st);
    st.textContent = `
      /* z-index 高于导航 gutter（≤1）与多数浮层，避免长列表挡住右下角 🧰 */
      #${MAIN_ID} {
        position: fixed; right: 12px; bottom: 12px; z-index: 1000100;
        width: 36px; height: 36px; border-radius: 50%; border: none;
        background: #2d72de; color: #fff; cursor: pointer; font-size: 15px;
        box-shadow: 0 2px 10px rgba(45,114,222,.35);
        display: flex; align-items: center; justify-content: center;
        transition: transform .15s ease; padding: 0; line-height: 1;
      }
      #${MAIN_ID}:hover { transform: scale(1.1); }
      #${MAIN_ID}.dwt-open { background: #1a5cc8; }
      #${MENU_ID} {
        position: fixed; right: 14px; bottom: 56px; z-index: 1000100;
        display: none; flex-direction: column; gap: 6px; align-items: flex-end;
      }
      #${MENU_ID}.dwt-open { display: flex; }
      #${MENU_ID} .dwt-rail-item {
        width: 32px; height: 32px; border-radius: 50%;
        border: 1px solid var(--dwt-border, #d0d7de);
        background: var(--dwt-bg, #fff); color: var(--dwt-fg, #1f2328);
        cursor: pointer; font-size: 13px; line-height: 1; padding: 0;
        box-shadow: 0 2px 8px rgba(0,0,0,.18);
        display: flex; align-items: center; justify-content: center;
        position: relative; z-index: 1;
      }
      #${MENU_ID} .dwt-rail-item:hover { border-color: #2d72de; background: #e8f0ff; }
      html.dwt-ui-dark #${MENU_ID} .dwt-rail-item:hover { background: #2a3550; }
      #${MENU_ID} .dwt-rail-item.dwt-on { border-color: #2d72de; box-shadow: 0 0 0 2px rgba(45,114,222,.35); }
      #${MENU_ID} .dwt-rail-label {
        font-size: 11px; color: var(--dwt-fg, #1f2328);
        background: var(--dwt-bg, #fff); border: 1px solid var(--dwt-border, #d0d7de);
        border-radius: 6px; padding: 2px 7px; margin-right: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,.12); white-space: nowrap;
        opacity: 0; pointer-events: none; transition: opacity .12s ease;
      }
      #${MENU_ID} .dwt-rail-row:hover .dwt-rail-label { opacity: 1; }
      #${MENU_ID} .dwt-rail-row {
        display: flex; align-items: center; position: relative;
      }
      /* 有托盘的行：左侧留出悬停热区，鼠标能滑到即将出现的色板而不离开行 */
      #${MENU_ID} .dwt-rail-row:has(.dwt-rail-tray) {
        padding-left: 220px; margin-left: -220px;
      }
      /* 托盘默认隐藏；仅悬停 / dwt-tray-open 时从右往左滑入。不跟「功能已开启 / 菜单已打开」绑死。 */
      #${MENU_ID} .dwt-rail-tray {
        position: absolute; right: 40px; top: 50%;
        display: flex; align-items: center;
        transform: translate(16px, -50%) scale(.96);
        opacity: 0; visibility: hidden; pointer-events: none;
        transition: transform .22s ease, opacity .18s ease, visibility .18s ease;
        z-index: 2; white-space: nowrap;
      }
      #${MENU_ID} .dwt-rail-row.dwt-tray-open .dwt-rail-tray,
      #${MENU_ID} .dwt-rail-row:hover .dwt-rail-tray {
        opacity: 1; visibility: visible; pointer-events: auto;
        transform: translate(0, -50%) scale(1);
      }
      /* 有托盘时悬停优先看色板，标题标签让开 */
      #${MENU_ID} .dwt-rail-row:has(.dwt-rail-tray):hover .dwt-rail-label,
      #${MENU_ID} .dwt-rail-row:has(.dwt-rail-tray).dwt-tray-open .dwt-rail-label {
        opacity: 0;
      }
    `;
  }

  function bindTrayHover(row) {
    if (!row || row.dataset.dwtTrayBound === '1') return;
    row.dataset.dwtTrayBound = '1';
    let leaveTimer = null;
    row.addEventListener('pointerenter', () => {
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      row.classList.add('dwt-tray-open');
    });
    row.addEventListener('pointerleave', () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      // 滑出即收：不因功能已开启而常驻（用户要求 hover 显隐）
      leaveTimer = setTimeout(() => {
        row.classList.remove('dwt-tray-open');
      }, 160);
    });
  }

  function ensureDom() {
    injectStyles();
    let menu = document.getElementById(MENU_ID);
    let main = document.getElementById(MAIN_ID);
    if (!main) {
      main = document.createElement('button');
      main.id = MAIN_ID;
      main.type = 'button';
      main.title = '豆包工具箱';
      main.textContent = '🧰';
      main.addEventListener('click', (e) => {
        e.stopPropagation();
        setExpanded(!expanded);
      });
      const host = document.body || document.documentElement;
      host.appendChild(main);
    }
    if (!menu) {
      menu = document.createElement('div');
      menu.id = MENU_ID;
      menu.addEventListener('click', (e) => e.stopPropagation());
      (document.body || document.documentElement).appendChild(menu);
    }
    // 全局点击收起 (capture, 不影响页面功能)
    // 菜单内部的点击不算「点外面」：预设色板这类控件需要连点比较，点一下就被收起等于没法用。
    if (!window.__dwtRailOutside) {
      window.__dwtRailOutside = true;
      document.addEventListener('click', (e) => {
        const menu = document.getElementById(MENU_ID);
        if (menu && e.target && menu.contains(e.target)) return;
        setExpanded(false);
      }, true);
    }
    return { main, menu };
  }

  function setExpanded(v) {
    expanded = !!v;
    const menu = document.getElementById(MENU_ID);
    const main = document.getElementById(MAIN_ID);
    if (menu) menu.classList.toggle('dwt-open', expanded);
    if (main) main.classList.toggle('dwt-open', expanded);
  }

  // 重新按 order 排序渲染菜单
  function render() {
    const { menu } = ensureDom();
    const sorted = Array.from(items.values()).sort((a, b) => (a.def.order || 50) - (b.def.order || 50));
    menu.innerHTML = '';
    sorted.forEach((it) => {
      const { def, el, hidden } = it;
      const row = document.createElement('div');
      row.className = 'dwt-rail-row';
      // setVisible(false) 必须扛住后续 add/remove 触发的 render，否则隐藏项会整行复活占位
      if (hidden) {
        row.style.display = 'none';
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
      const label = document.createElement('span');
      label.className = 'dwt-rail-label';
      label.textContent = def.title || def.id;
      // def.help 给了就在标题右侧挂 ⓘ（悬停出表格化说明）；没给就完全不出现，不影响旧入口
      if (def.help) {
        try { window.dwt?.helpTip?.attach?.(label, def.help); } catch (e) { console.warn('[dwt-rail]', def.id, 'help', e); }
      }
      row.appendChild(label);
      const trayEl = trays.get(def.id);
      if (trayEl) {
        const wrap = document.createElement('div');
        wrap.className = 'dwt-rail-tray';
        wrap.appendChild(trayEl);
        row.appendChild(wrap);
        bindTrayHover(row);
      }
      row.appendChild(el);
      menu.appendChild(row);
    });
    customRows.forEach((el) => {
      const row = document.createElement('div');
      row.className = 'dwt-rail-row';
      row.appendChild(el);
      menu.appendChild(row);
    });
  }

  function add(def) {
    if (!def || !def.id) return null;
    defs[def.id] = def;
    if (items.has(def.id)) {
      // 重注入时更新 def（keepMenuOpen / onClick），避免仍用旧闭包
      items.get(def.id).def = def;
      return items.get(def.id).el;
    }
    const el = document.createElement('button');
    el.className = 'dwt-rail-item';
    el.type = 'button';
    el.textContent = def.icon || '•';
    if (def.domId) el.id = def.domId;
    el.title = def.title || def.id;
    el.addEventListener('click', () => {
      const cur = items.get(def.id);
      const d = (cur && cur.def) || def;
      // keepMenuOpen：色板类入口点自己不关菜单，否则托盘一起消失
      if (!d.keepMenuOpen) setExpanded(false);
      try { d.onClick && d.onClick(el); } catch (e) { console.warn('[dwt-rail]', d.id, e); }
    });
    items.set(def.id, { def, el });
    render();
    return el;
  }

  function remove(id) {
    delete defs[id];
    trays.delete(id); // 卸入口时顺带拆托盘，避免再 add 同 id 时旧托盘空洞复活
    if (!items.has(id)) return;
    items.get(id).el.remove();
    items.delete(id);
    render();
  }

  // 模块自定义行：el 由模块创建（含自己的按钮/事件），rail 只负责放进菜单并在每次 render 后补回
  function addCustomRow(id, el) {
    if (!id || !el) return null;
    customRows.set(id, el);
    render();
    return el;
  }

  function removeCustomRow(id) {
    if (!customRows.has(id)) return;
    customRows.delete(id);
    render();
  }

  // 把托盘挂到指定入口按钮左侧（悬停从右往左滑出）；itemId 对应 rail.add 的 id
  function attachTray(itemId, el) {
    if (!itemId || !el) return null;
    const prev = trays.get(itemId);
    trays.set(itemId, el);
    // 已挂在正确行里则跳过 render：每次点色板都整菜单重建会打断 :hover
    if (prev === el) {
      const btn = items.get(itemId) && items.get(itemId).el;
      const row = el.closest && el.closest('.dwt-rail-row');
      if (btn && row && row.contains(btn) && (row.contains(el) || (el.parentElement && row.contains(el.parentElement)))) {
        bindTrayHover(row);
        return el;
      }
    }
    render();
    return el;
  }

  function detachTray(itemId) {
    if (!trays.has(itemId)) return;
    trays.delete(itemId);
    render();
  }

  function getEl(id) {
    const it = items.get(id);
    return it ? it.el : null;
  }

  // id 查找同时兼容 domId (模块可能只拿到历史 id)
  function setActive(id, on) {
    const it = items.get(id) || Array.from(items.values()).find((x) => x.def.domId === id);
    if (it) {
      // 只亮入口选中态；托盘显隐纯靠悬停，不在这里强行钉开
      it.el.classList.toggle('dwt-on', !!on);
    }
  }

  function setVisible(id, v) {
    const it = items.get(id) || Array.from(items.values()).find((x) => x.def.domId === id);
    if (!it) return;
    const show = v !== false;
    it.hidden = !show;
    it.el.style.display = show ? '' : 'none';
    // 必须藏整行：只藏按钮时 .dwt-rail-row（尤其带托盘的 padding-left:220px）仍占位，菜单中间会出现空洞
    const row = it.el.closest && it.el.closest('.dwt-rail-row');
    if (row) row.style.display = show ? '' : 'none';
  }

  function setIcon(id, icon) {
    const it = items.get(id);
    if (it) it.el.textContent = icon;
  }

  function boot() {
    ensureDom();
    // 补回上一轮（或本轮更早）注册过、但本实例 items 为空的入口
    Object.keys(defs).forEach((id) => {
      if (!items.has(id)) add(defs[id]);
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // live-boot 环境下 body 可能晚一拍
  if (!document.getElementById(MAIN_ID)) setTimeout(boot, 200);

  dwt.rail = {
    add, remove, getEl, setActive, setVisible, setIcon,
    addCustomRow, removeCustomRow, attachTray, detachTray,
    collapse: () => setExpanded(false),
  };
  console.log('[cs][doubao-web-toolkit] ui-rail ready');
})();
