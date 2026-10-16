// conversation-manager/module.js — 对话管理与清理
// 功能: 扫描左侧会话列表 → 注入复选框 → 全选/反选 → 批量删除
// 说明: 删除通过模拟点击豆包自带的会话菜单「删除」项完成, 不直接调用任何接口.
//       每次删除前需用户二次确认, 避免误删.
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_conv_manager';
  const BAR_ID = 'dwt-conv-bar';
  const CHECK_CLASS = 'dwt-conv-check';

  let enabled = false;
  let panelOpen = false;

  // ---------- 会话列表定位 ----------

  // 豆包左侧会话列表项: 带会话 id 的链接 (href 含 /chat/)
  function getConversationItems() {
    const links = document.querySelectorAll('a[href*="/chat/"]');
    const items = [];
    const seen = new Set();
    links.forEach((a) => {
      // 排除侧边栏导航自身/当前页
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/chat\/(\d+)/);
      if (!m) return;
      const id = m[1];
      if (seen.has(id)) return;
      seen.add(id);
      const title = (a.innerText || '').trim().split('\n')[0];
      if (!title) return;
      items.push({ id, title, node: a });
    });
    return items;
  }

  // ---------- 复选框注入 ----------

  function clearChecks() {
    document.querySelectorAll('.' + CHECK_CLASS).forEach((el) => el.remove());
  }

  function injectChecks() {
    if (!enabled) return;
    const items = getConversationItems();
    items.forEach((it) => {
      // 已注入则跳过 (用 dataset 标记)
      const parent = it.node.parentElement;
      if (!parent || parent.querySelector(':scope > .' + CHECK_CLASS)) return;
      if (parent.dataset.dwtChecked === it.id) return;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = CHECK_CLASS;
      box.dataset.convId = it.id;
      box.style.cssText = 'position:absolute;left:2px;top:50%;transform:translateY(-50%);z-index:10;'
        + 'cursor:pointer;width:14px;height:14px;';
      // 保证父容器可定位
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.dataset.dwtChecked = it.id;
      parent.appendChild(box);
    });
  }

  function getCheckedIds() {
    return Array.from(document.querySelectorAll('.' + CHECK_CLASS))
      .filter((b) => b.checked)
      .map((b) => b.dataset.convId);
  }

  // ---------- 删除 (模拟点击豆包自带菜单) ----------

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // 找到会话项对应的「更多/菜单」按钮
  // 豆包侧栏的操作按钮默认 opacity:0, 仅 hover 才渲染/可点, 因此需要:
  //   1) 先派发 mouseover 触发 hover 态, 等 React 渲染出按钮
  //   2) 从最近的 section 祖先里找 [data-sidebar-item-actions] 内的按钮
  async function findMenuButton(item) {
    const link = item.node;
    const section = link.closest('section') || link.parentElement;
    if (!section) return null;

    // 触发 hover
    section.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    section.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(200);

    // 优先: 豆包专属的侧栏操作容器
    const actWrap = section.querySelector('[data-sidebar-item-actions="true"]');
    if (actWrap) {
      const b = actWrap.querySelector('button, [data-dbx-name="button"], [role="button"]');
      if (b) return b;
    }
    // 兜底 1: 语义化匹配
    let btn = section.querySelector('[aria-label*="更多"], [class*="more" i], [class*="menu" i]');
    if (btn) return btn;
    // 兜底 2: section 内最后一个 button
    const btns = section.querySelectorAll('button');
    return btns.length ? btns[btns.length - 1] : null;
  }

  // 删除单个会话: 点菜单 → 点删除项 → 确认
  async function deleteOne(item) {
    const menuBtn = await findMenuButton(item);
    if (!menuBtn) return false;
    menuBtn.click();
    await sleep(400);
    // 在弹出菜单里找「删除」(限定在 role=menu / 浮层里, 避免误点页面其他按钮)
    const menuItems = document.querySelectorAll(
      '[role="menu"] [role="menuitem"], [role="menuitem"], [class*="menu-item"], [class*="dropdown"] li'
    );
    let delEl = null;
    for (const el of menuItems) {
      const t = (el.innerText || '').trim();
      if (t === '删除' || t === '删除对话' || /^删除/.test(t)) { delEl = el; break; }
    }
    if (!delEl) {
      // 关闭误开菜单
      document.body.click();
      return false;
    }
    delEl.click();
    await sleep(400);
    // 二次确认弹窗 (仅匹配可见的确认按钮)
    const confirmBtns = document.querySelectorAll('button, [role="button"]');
    for (const b of confirmBtns) {
      const t = (b.innerText || '').trim();
      if ((t === '删除' || t === '确定' || t === '确认') && b.offsetParent !== null) { b.click(); break; }
    }
    await sleep(500);
    return true;
  }

  async function deleteChecked() {
    const ids = getCheckedIds();
    if (!ids.length) { alert('请先勾选要删除的会话'); return; }
    if (!confirm('确认删除选中的 ' + ids.length + ' 个会话? 此操作不可恢复。')) return;
    const items = getConversationItems();
    const targets = items.filter((it) => ids.includes(it.id));
    let ok = 0;
    for (const it of targets) {
      try { if (await deleteOne(it)) ok++; } catch (_) {}
      await sleep(300);
    }
    alert('已删除 ' + ok + '/' + targets.length + ' 个会话');
    refresh();
  }

  // ---------- 操作条 ----------

  function buildBar() {
    if (document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    // 位置: 右侧 right:12px, 底栏上方 bottom:128px (toggle 在 bottom:128px, 展开条在其下方)
    // 原 left:8px 会被豆包左侧 280px 会话栏遮挡, 故移到右侧, 与其他扩展 UI 同侧
    bar.style.cssText = 'position:fixed;right:12px;bottom:128px;z-index:999998;background:#fff;'
      + 'border:1px solid #d0d7de;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);'
      + 'font-size:11px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:none;flex-direction:column;gap:6px;width:150px;';
    bar.innerHTML = '<b>对话管理</b>'
      + '<div style="color:#8b949e;">已勾选 <span id="dwt-conv-count">0</span> 个</div>'
      + '<button id="dwt-conv-all" style="padding:4px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;">全选/反选</button>'
      + '<button id="dwt-conv-del" style="padding:4px;border:1px solid #f0b0b0;border-radius:6px;background:#fff;color:#cf222e;cursor:pointer;">删除选中</button>'
      + '<button id="dwt-conv-refresh" style="padding:4px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;">刷新列表</button>';
    document.body.appendChild(bar);

    bar.addEventListener('click', (e) => {
      const id = e.target.id;
      if (id === 'dwt-conv-all') {
        const boxes = document.querySelectorAll('.' + CHECK_CLASS);
        const allChecked = Array.from(boxes).every((b) => b.checked);
        boxes.forEach((b) => { b.checked = !allChecked; });
        updateCount();
      } else if (id === 'dwt-conv-del') {
        deleteChecked();
      } else if (id === 'dwt-conv-refresh') {
        refresh();
      }
    });
    bar.addEventListener('change', updateCount);

    // 悬浮入口按钮 (也移到右侧, 在 enhance-btn bottom:96px 之下, 留 20px 间距)
    const toggle = document.createElement('button');
    toggle.id = 'dwt-conv-toggle';
    toggle.textContent = '\u{1F5C2}';
    toggle.title = '对话管理';
    toggle.style.cssText = 'position:fixed;right:12px;bottom:128px;z-index:999998;width:32px;height:32px;'
      + 'border-radius:50%;border:1px solid #d0d7de;background:#fff;cursor:pointer;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:14px;line-height:1;';
    toggle.onclick = () => {
      panelOpen = !panelOpen;
      bar.style.display = panelOpen ? 'flex' : 'none';
      if (panelOpen) refresh();
    };
    document.body.appendChild(toggle);
  }

  function updateCount() {
    const el = document.getElementById('dwt-conv-count');
    if (el) el.textContent = String(getCheckedIds().length);
  }

  function refresh() {
    clearChecks();
    injectChecks();
    updateCount();
  }

  // ---------- 主流程 ----------

  function mount() {
    if (!enabled) return;
    buildBar();
    refresh();
    setInterval(() => { if (enabled && panelOpen) injectChecks(); }, 4000);
    console.log('[dwt-conv-manager] mounted');
  }

  function unmount() {
    clearChecks();
    const bar = document.getElementById(BAR_ID);
    const toggle = document.getElementById('dwt-conv-toggle');
    if (bar) bar.remove();
    if (toggle) toggle.remove();
  }

  async function loadConfig() {
    try {
      const r = await chrome.storage.local.get(KEY);
      enabled = r[KEY] === true; // 默认关闭 (删除类操作需用户显式开启)
    } catch (_) { enabled = false; }
  }

  dwt.convManagerModule = {
    mount, unmount, refresh, getConversationItems,
    setEnabled(v) { enabled = !!v; if (enabled) mount(); else unmount(); },
    isEnabled: () => enabled,
  };

  loadConfig().then(mount);

  console.log('[doubao-web-toolkit] conversation-manager module ready');
})();
