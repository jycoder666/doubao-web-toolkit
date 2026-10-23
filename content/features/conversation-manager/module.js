// conversation-manager/module.js — 对话管理与清理
// 功能: 扫描左侧会话列表 → 注入复选框 → 全选/反选 → 批量删除
// 说明: 删除通过模拟点击豆包自带的会话菜单「删除」项完成, 不直接调用任何接口.
//       每次删除前需用户二次确认, 避免误删.
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_conv_manager';
  const GKEY = 'dwt_conv_groups'; // #53/#54: 本地分组 (会话 id → 命名分组)
  const BAR_ID = 'dwt-conv-bar';
  const CHECK_CLASS = 'dwt-conv-check';
  const DOT_CLASS = 'dwt-conv-gdot';

  let enabled = false;
  let panelOpen = false;
  let groups = []; // [{ id, name, ids: [] }]

  const GCOLORS = ['#2d72de', '#1a7f37', '#9a6700', '#8250df', '#cf222e', '#0969da'];

  // ⓘ 用法说明：面板标题与 rail 旁注共用
  const HELP = {
    title: '🗂 对话管理',
    desc: '侧栏勾选会话，批量删除或本地分组。',
    rows: [
      ['打开', '点 🗂 → 侧栏出现勾选框'],
      ['全选 / 删除', '操作条内一键全选；删除走豆包菜单，需点两次确认'],
      ['刷新', '侧栏虚拟列表滚过后点「刷新列表」'],
      ['分组', '新建分组 → 勾选 →「加入选中」；圆点标在会话尾'],
    ],
    note: '删除不可恢复；分组只存本机。',
  };

  function saveGroups() {
    try { chrome.storage.local.set({ [GKEY]: groups }); } catch (_) {}
  }

  function groupOf(convId) {
    return groups.find((g) => g.ids.indexOf(convId) >= 0) || null;
  }

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
    document.querySelectorAll('.' + DOT_CLASS).forEach((el) => el.remove());
  }

  function bindCheckBox(box) {
    // 豆包侧栏 <a> 全行可点：不拦冒泡会被导航吃掉，勾选看起来「点不了」
    const stop = (e) => { e.stopPropagation(); };
    box.addEventListener('pointerdown', stop, true);
    box.addEventListener('mousedown', stop, true);
    box.addEventListener('mouseup', stop, true);
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      // 不 preventDefault：让 checkbox 自己切换
    }, true);
    box.addEventListener('change', updateCount);
  }

  function injectChecks() {
    if (!enabled || !panelOpen) return;
    const items = getConversationItems();
    items.forEach((it) => {
      // 已注入则跳过: 以真实 DOM 存在为准。
      // 不能只看 dataset 标记 — 豆包 React 重渲染侧栏会移除注入的 checkbox,
      // 但 dataset 留在原生属性上, 若据此跳过将永远不再补挂 (复选框消失 bug)。
      const parent = it.node.parentElement;
      if (!parent) return;
      let box = parent.querySelector(':scope > .' + CHECK_CLASS);
      if (box) {
        syncGroupDot(it);
        return;
      }
      box = document.createElement('input');
      box.type = 'checkbox';
      box.className = CHECK_CLASS;
      box.dataset.convId = it.id;
      box.style.cssText = 'position:absolute;left:4px;top:50%;transform:translateY(-50%);'
        + 'z-index:100;cursor:pointer;width:15px;height:15px;margin:0;'
        + 'pointer-events:auto;accent-color:#2d72de;';
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.dataset.dwtChecked = it.id;
      bindCheckBox(box);
      parent.appendChild(box);
      syncGroupDot(it);
    });
  }

  // ---------- 分组 (#53 markManage / #54 folder) ----------
  // 本地命名分组: 侧栏会话项挂彩色圆点标识; 存 chrome.storage.local.dwt_conv_groups

  function syncGroupDot(item) {
    const parent = item.node.parentElement;
    if (!parent) return;
    let dot = parent.querySelector(':scope > .' + DOT_CLASS);
    const g = groupOf(item.id);
    if (!g) { if (dot) dot.remove(); return; }
    if (!dot) {
      dot = document.createElement('span');
      dot.className = DOT_CLASS;
      dot.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);'
        + 'width:7px;height:7px;border-radius:50%;z-index:10;pointer-events:none;';
      parent.appendChild(dot);
    }
    const color = GCOLORS[groups.indexOf(g) % GCOLORS.length];
    dot.style.background = color;
    dot.title = '分组: ' + g.name;
  }

  function renderGroupChips() {
    const box = document.getElementById('dwt-conv-groups');
    if (!box) return;
    box.innerHTML = '';
    groups.forEach((g, i) => {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:999px;'
        + 'font-size:10px;color:#fff;background:' + GCOLORS[i % GCOLORS.length] + ';cursor:default;';
      chip.title = '成员 ' + g.ids.length + ' 个会话';
      const label = document.createElement('span');
      label.textContent = g.name + '(' + g.ids.length + ')';
      const x = document.createElement('span');
      x.textContent = '×';
      x.style.cssText = 'cursor:pointer;font-weight:700;';
      x.title = '删除分组 (不动会话)';
      x.addEventListener('click', () => {
        groups = groups.filter((gg) => gg.id !== g.id);
        saveGroups();
        renderGroupChips();
        refresh();
      });
      chip.appendChild(label);
      chip.appendChild(x);
      box.appendChild(chip);
    });
    // 分组下拉
    const sel = document.getElementById('dwt-conv-gsel');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = groups.length
        ? groups.map((g) => '<option value="' + g.id + '">' + g.name + '</option>').join('')
        : '<option value="">(先新建分组)</option>';
      if (cur && groups.some((g) => g.id === cur)) sel.value = cur;
    }
  }

  function createGroup(name) {
    const n = (name || '').trim();
    if (!n) return;
    groups.push({ id: 'g' + Date.now().toString(36), name: n, ids: [] });
    saveGroups();
    renderGroupChips();
  }

  async function assignCheckedToGroup(gid) {
    const g = groups.find((x) => x.id === gid);
    if (!g) { hint('请先新建分组'); return; }
    const ids = getCheckedIds();
    if (!ids.length) { hint('请先勾选会话'); return; }
    ids.forEach((id) => { if (g.ids.indexOf(id) < 0) g.ids.push(id); });
    saveGroups();
    renderGroupChips();
    refresh();
  }

  function getCheckedIds() {
    return Array.from(document.querySelectorAll('.' + CHECK_CLASS))
      .filter((b) => b.checked)
      .map((b) => b.dataset.convId);
  }

  // bar 内非阻塞提示 (替代 alert: 模态框会卡死渲染进程与自动化工具)
  function hint(msg) {
    const el = document.getElementById('dwt-conv-hint');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(hint._t);
    hint._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
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

  // 两段式确认 (替代 confirm/alert: 模态框会卡死渲染进程与自动化工具)
  let deleteArmed = 0;

  async function deleteChecked() {
    const ids = getCheckedIds();
    if (!ids.length) { hint('请先勾选要删除的会话'); return; }
    const now = Date.now();
    if (now - deleteArmed > 5000) {
      deleteArmed = now;
      hint('将删除选中的 ' + ids.length + ' 个会话且不可恢复 — 5 秒内再点一次确认');
      return;
    }
    deleteArmed = 0;
    const items = getConversationItems();
    const targets = items.filter((it) => ids.includes(it.id));
    let ok = 0;
    for (const it of targets) {
      try { if (await deleteOne(it)) ok++; } catch (_) {}
      await sleep(300);
    }
    hint('已删除 ' + ok + '/' + targets.length + ' 个会话');
    refresh();
  }

  // ---------- 操作条 ----------

  function closePanel() {
    panelOpen = false;
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.style.display = 'none';
    clearChecks();
    updateCount();
  }

  function openPanel() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    panelOpen = true;
    bar.style.display = 'flex';
    window.dwt?.drag?.restore?.(bar);
    refresh();
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  // 拖拽：标题行为把手（操作条钉在右下角会叠在 rail / 输入框上）。
  // 条子跨重注入存活（buildBar 下面直接早退），挂载要覆盖「复用」与「重建」两条路 —— attach 幂等。
  function bindDrag(bar) {
    const head = bar.querySelector('.dwt-conv-head') || bar.firstElementChild;
    if (!head) return;
    head.querySelectorAll('button').forEach((btn) => {
      if (btn.dataset.dwtPtrShield === '1') return;
      btn.dataset.dwtPtrShield = '1';
      btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);
    });
    window.dwt?.drag?.attach?.(bar, {
      key: 'conv',
      handle: head,
      exclude: 'button,a,input,textarea,select,label,.dwt-help-btn,.dwt-no-drag',
    });
  }

  function ensureCloseBtn(bar) {
    if (!bar) return;
    let head = bar.querySelector('.dwt-conv-head');
    if (!head) {
      const title = bar.querySelector(':scope > b');
      if (!title) return;
      head = document.createElement('div');
      head.className = 'dwt-conv-head';
      head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
      title.replaceWith(head);
      head.appendChild(title);
    }
    let btn = bar.querySelector('#dwt-conv-x');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'dwt-conv-x';
      btn.className = 'dwt-conv-x';
      btn.setAttribute('aria-label', '关闭对话管理');
      btn.textContent = '×';
      btn.style.cssText = 'border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1;'
        + 'padding:0 2px;color:var(--dwt-muted,#8b949e);flex-shrink:0;';
      head.appendChild(btn);
    }
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    };
  }

  function buildBar() {
    const existing = document.getElementById(BAR_ID);
    if (existing) {
      ensureCloseBtn(existing);
      window.dwt?.helpTip?.attach?.(existing.querySelector('.dwt-conv-head > b, :scope > b'), HELP);
      bindDrag(existing);
      ensureRail();
      return;
    }
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    // 位置: 右侧 right:12px, 底栏上方 bottom:128px (toggle 在 bottom:128px, 展开条在其下方)
    // 原 left:8px 会被豆包左侧 280px 会话栏遮挡, 故移到右侧, 与其他扩展 UI 同侧
    bar.style.cssText = 'position:fixed;right:12px;bottom:128px;z-index:999998;background:var(--dwt-bg,#fff);'
      + 'border:1px solid #d0d7de;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);'
      + 'font-size:11px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:none;flex-direction:column;gap:6px;width:150px;';
    bar.innerHTML = '<div class="dwt-conv-head" style="display:flex;align-items:center;justify-content:space-between;gap:6px;">'
      + '<b>对话管理</b>'
      + '<button type="button" id="dwt-conv-x" class="dwt-conv-x" aria-label="关闭对话管理" '
      + 'style="border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;color:var(--dwt-muted,#8b949e);flex-shrink:0;">×</button>'
      + '</div>'
      + '<div style="color:#8b949e;">已勾选 <span id="dwt-conv-count">0</span> 个</div>'
      + '<button id="dwt-conv-all" style="padding:4px;border:1px solid #d0d7de;border-radius:6px;background:var(--dwt-soft,#fff);color:var(--dwt-fg,#1f2328);cursor:pointer;">全选/反选</button>'
      + '<button id="dwt-conv-del" style="padding:4px;border:1px solid #f0b0b0;border-radius:6px;background:var(--dwt-soft,#fff);color:#cf222e;cursor:pointer;">删除选中</button>'
      + '<button id="dwt-conv-refresh" style="padding:4px;border:1px solid #d0d7de;border-radius:6px;background:var(--dwt-soft,#fff);color:var(--dwt-fg,#1f2328);cursor:pointer;">刷新列表</button>'
      // 分组区 (#53/#54)
      + '<div style="border-top:1px solid #eef1f4;margin-top:4px;padding-top:6px;">'
      + '<b>分组</b>'
      + '<div id="dwt-conv-groups" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;"></div>'
      + '<div style="display:flex;gap:4px;margin-top:6px;">'
      + '<input id="dwt-conv-gname" placeholder="新分组名" style="flex:1;min-width:0;padding:3px 6px;border:1px solid #d0d7de;border-radius:6px;font-size:11px;">'
      + '<button id="dwt-conv-gadd" style="padding:3px 8px;border:1px solid #d0d7de;border-radius:6px;background:var(--dwt-soft,#fff);color:var(--dwt-fg,#1f2328);cursor:pointer;font-size:11px;">新建</button>'
      + '</div>'
      + '<div style="display:flex;gap:4px;margin-top:4px;">'
      + '<select id="dwt-conv-gsel" style="flex:1;min-width:0;padding:3px;border:1px solid #d0d7de;border-radius:6px;font-size:11px;"></select>'
      + '<button id="dwt-conv-gassign" style="padding:3px 8px;border:1px solid #2d72de;color:#2d72de;border-radius:6px;background:var(--dwt-soft,#fff);cursor:pointer;font-size:11px;">加入选中</button>'
      + '</div>'
      + '<div id="dwt-conv-hint" style="display:none;margin-top:4px;padding:3px 6px;border-radius:6px;background:#fff8c5;color:#9a6700;font-size:10px;line-height:1.4;"></div>'
      + '<div style="color:#8b949e;margin-top:4px;font-size:10px;">分组圆点挂在侧栏会话尾部</div>'
      + '</div>';
    document.body.appendChild(bar);
    ensureCloseBtn(bar);
    window.dwt?.helpTip?.attach?.(bar.querySelector('.dwt-conv-head > b'), HELP);
    bindDrag(bar);

    bar.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#dwt-conv-x')) return;
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
      } else if (id === 'dwt-conv-gadd') {
        const inp = document.getElementById('dwt-conv-gname');
        createGroup(inp ? inp.value : '');
        if (inp) inp.value = '';
      } else if (id === 'dwt-conv-gassign') {
        const sel = document.getElementById('dwt-conv-gsel');
        assignCheckedToGroup(sel ? sel.value : '');
      }
    });
    const gname = document.getElementById('dwt-conv-gname');
    if (gname) {
      gname.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          createGroup(gname.value);
          gname.value = '';
        }
      });
    }

    ensureRail();
  }

  function ensureRail() {
    try { window.dwt?.rail?.remove?.('conv'); } catch (_) {}
    window.dwt?.rail?.add?.({
      id: 'conv',
      icon: '🗂',
      title: '对话管理',
      order: 30,
      onClick: () => togglePanel(),
    });
  }

  function updateCount() {
    const el = document.getElementById('dwt-conv-count');
    if (el) el.textContent = String(getCheckedIds().length);
  }

  function refresh() {
    clearChecks();
    injectChecks();
    updateCount();
    renderGroupChips();
  }

  // ---------- 主流程 ----------

  function mount() {
    if (!enabled) return;
    buildBar();
    refresh();
    setInterval(() => { if (enabled && panelOpen) injectChecks(); }, 4000);
    console.log('[cs][dwt-conv-manager] mounted');
  }

  function unmount() {
    clearChecks();
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.remove();
    window.dwt?.rail?.remove?.('conv');
  }

  async function loadConfig() {
    try {
      const r = await chrome.storage.local.get([KEY, GKEY]);
      enabled = r[KEY] === true; // 默认关闭 (删除类操作需用户显式开启)
      groups = Array.isArray(r[GKEY]) ? r[GKEY] : [];
    } catch (_) { enabled = false; }
  }

  dwt.convManagerModule = {
    mount, unmount, refresh, getConversationItems,
    setEnabled(v) { enabled = !!v; if (enabled) mount(); else unmount(); },
    isEnabled: () => enabled,
  };

  loadConfig().then(mount);

  console.log('[cs][doubao-web-toolkit] conversation-manager module ready');
})();
