// export/module.js — 对话导出: Markdown 单会话 + JSON 全量（纯滚动采集版）
// 传统脚本: IIFE + window.dwt
// 顶部维护:
//   - 原实现用 [class*="message-list"] 限定搜索范围, 但豆包页面上此 class 不存在,
//     导致 collectMessages 始终返回空数组, 导出"未找到对话内容"。
//   - 修复: 通过 dwt.selectorManager.getMessageList() 取真实容器 (优先内部滚动容器
//     div.v_list_scroller-*, 无则 document.body)。
//   - 全量重构: 豆包消息区是虚拟列表, 只渲染可视窗口, 直接 collectMessages 只能
//     导出屏幕内的几条。现改为纯滚动采集(零网络请求): 找到滚动容器后记录初始
//     scrollTop, 从当前位置向上逐步滚动加载历史, 每步跑一轮 collectMessages 并按
//     「消息身份」(msgKey) 去重合并; 排序零布局依赖: 采集循环本身从底部(新)向上
//     (老)滚, 捕获步序号即时间序 —— absorb 首捕时记录「步序号 step + 步内 DOM 序
//     idx」, 最终排序 = step 降序(步序号越大越老、排越前) + 同 step 内 idx 升序
//     (DOM 自然序)。真机实测 offsetTop 链在滚动容器下对用户气泡/AI 消息结构分叉,
//     累加值系统性偏差, 布局坐标方案结构性失效 —— contentOffset 已删除, 采集与
//     排序路径不再出现任何布局坐标量。
//   - 三守卫: MAX_STEPS / STEP_DELAY / TOTAL_TIMEOUT, 采集过程有 fixed 进度浮层
//     (实时条数 + 取消按钮), 取消后立即中断并导出已采集部分; 结束(完成/取消/超时)
//     恢复初始滚动位置。export 路径禁 alert, 提示统一走浮层。
//   - 菜单入口: dwt.exportModule 暴露后经既有 dwt.rail 注册「📄 导出 Markdown」
//     (order 2) 与「📦 导出 JSON」(order 3), 与 batch(1) 错开; rail 未就绪时按
//     attempt<25 + setTimeout 重试(参考 panel.js registerBatchRail 模式)。
//   - known limitation: msgKey = role + 规范化文本前 500 字。豆包不暴露每条消息的
//     稳定 id, 节点复用下 DOM 属性不可靠, 纯滚动采集约束下这是唯一可行身份键。
//     代价: 用户连发两条完全相同内容(或两条长文前 500 字相同)时导出会合并为一条
//     —— 设计取舍, 非 bug; 无错序、不影响其它消息。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const SEL_USER_ROW = '[class*="sendMessage"]';    // 整行级用户标记（粘贴代码/JSON 时没有气泡背景类）
  const SEL_AI_ROW = '[class*="receiveMessage"]';
  const SEL_AI_CONTENT = '[class*="conversation-message-content-padding-right"]';

  // —— 滚动采集三守卫（常量名即契约）——
  const MAX_STEPS = 300;        // 最多滚动步数（防死循环）
  const STEP_DELAY = 200;       // 每步等待 ms（等虚拟列表渲染 + DOM 稳定）
  const TOTAL_TIMEOUT = 45000;  // 总超时 ms（超时导出已采集部分）
  const STEP_PX = 800;          // 每步向上滚动距离
  const STALL_LIMIT = 2;        // 到顶且无新增时, 连续确认次数

  // 取消息列表根容器 (优先真实滚动容器, 无则 document.body)
  function getMsgList() {
    const sm = dwt.selectorManager;
    if (sm && sm.getMessageList) return sm.getMessageList();
    return document.body;
  }

  // 消息块 = .list_items 下的 .v_list_row (豆包虚拟列表行)。
  // 不能直接收集 aiContent 命中项：实测一条助手消息里会有多个命中节点，
  // 其中一个是「用户提问回显」(无操作栏)，真正的回答反而带 message-action-bar，
  // 早期实现把带操作栏的过滤掉 → 导出里只剩回显、丢掉真回答。
  const ROW_SEL = '[class*="v_list_row"]';
  const ACTION_BAR_SEL = '[class*="message-action-bar"]';

  // 取节点文本：操作栏（复制/重新生成…）通常排在正文之后，用文本尾部裁剪，
  // 不克隆节点 —— 脱离文档的克隆拿不到 innerText 的换行（只有 textContent），会把正文挤成一行
  function nodeText(node) {
    if (!node) return '';
    const full = (node.innerText || node.textContent || '').trim();
    if (!full) return '';
    const bar = node.querySelector(ACTION_BAR_SEL);
    if (bar) {
      const bt = (bar.innerText || bar.textContent || '').trim();
      if (bt && full.endsWith(bt)) return full.slice(0, full.length - bt.length).trim();
    }
    return full;
  }

  function collectRows() {
    const list = getMsgList();
    let rows = Array.from(list.querySelectorAll(ROW_SEL));
    if (!rows.length) {
      // 结构变了：退回「容器内的直接消息节点」，至少不返回空
      rows = Array.from(list.querySelectorAll(
        (dwt.selectorManager?.getUserBubble?.() || SEL_USER_BUBBLE) + ', ' + (dwt.selectorManager?.getAiContent?.() || SEL_AI_CONTENT)
      ));
    }
    return rows;
  }

  function collectMessages() {
    const list = getMsgList();
    const ubSel = dwt.selectorManager?.getUserBubble?.() || SEL_USER_BUBBLE;
    const userRowSel = dwt.selectorManager?.getUserRow?.() || SEL_USER_ROW;
    const aiRowSel = dwt.selectorManager?.getAiRow?.() || SEL_AI_ROW;
    const aiSel = dwt.selectorManager?.getAiContent?.() || SEL_AI_CONTENT;
    const results = [];

    collectRows().forEach((row) => {
      const bubble = row.querySelector(ubSel);
      const ai = row.querySelector(aiSel);
      // 用户气泡可能就落在 aiContent 命中项内，角色判定优先用户气泡
      if (bubble && (bubble.innerText || '').trim()) {
        const t = nodeText(bubble);
        if (t) { results.push({ role: 'user', text: t, node: bubble }); return; }
      }
      // 没有气泡背景类 ≠ AI：粘贴大段 JSON / 代码时豆包不套气泡背景类，整行只剩 sendMessage
      // 标记（AI 行是 receiveMessage）—— 不兜底就把用户自己的粘贴导成 🤖 AI（真机实测 4 条全中）。
      // 带 receiveMessage 的行不算（AI 回复里引用用户原话时也会出现 sendMessage）。
      if (!bubble && row.querySelector(userRowSel) && !row.querySelector(aiRowSel) && ai) {
        const t = nodeText(ai);
        if (t) { results.push({ role: 'user', text: t, node: ai }); return; }
      }
      if (ai) {
        if (ai.closest(ubSel) && ai.closest(ubSel) !== bubble) return;
        // 一行内可能有多个命中节点：取正文最长者（真正的回答）
        const cands = Array.from(row.querySelectorAll(aiSel)).filter((n) => !n.closest(ubSel));
        const best = (cands.length ? cands : [ai])
          .map((n) => ({ n, t: nodeText(n) }))
          .sort((a, b) => b.t.length - a.t.length)[0];
        if (best && best.t) results.push({ role: 'assistant', text: best.t, node: best.n });
      }
    });

    // 兜底：行结构全空时按老路径收集（含范围外元素）。
    // 注意：不做排序 —— 虚拟列表下节点可复用，本步内的 DOM 顺序即当前渲染顺序，
    // 全局顺序由 collectAllMessages 按首捕步序号(step) + 步内序(idx)统一排。
    if (!results.length) {
      const seen = new Set();
      list.querySelectorAll(ubSel).forEach((b) => {
        const t = nodeText(b);
        if (t && !seen.has(b)) { seen.add(b); results.push({ role: 'user', text: t, node: b }); }
      });
      list.querySelectorAll(aiSel).forEach((c) => {
        if (c.closest(ubSel)) return;
        const t = nodeText(c);
        if (t && !seen.has(c)) { seen.add(c); results.push({ role: 'assistant', text: t, node: c }); }
      });
    }
    return results;
  }

  // —— 滚动容器定位：getMessageList() 结果本身可滚则直接用；
  //    否则沿祖先链找第一个出现纵向溢出的容器；全无则退回文档滚动根 ——
  function findScroller() {
    const list = getMsgList();
    let el = list;
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // —— 消息身份键：role + 规范化文本（压空白）。虚拟列表节点复用, 同一消息会在
  //    多个滚动步里重复出现, 身份相同只留首捕一条 ——
  function msgKey(msg) {
    const norm = String(msg.text || '').replace(/\s+/g, ' ').trim();
    return msg.role + '|' + norm.slice(0, 500);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // —— 进度浮层：fixed 小条（文案含「采集中」+ 实时条数 + 取消按钮）——
  let cancelled = false;

  function buildOverlay() {
    const bar = document.createElement('div');
    bar.style.position = 'fixed';
    bar.style.right = '16px';
    bar.style.bottom = '16px';
    bar.style.zIndex = '2147483646';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '8px';
    bar.style.padding = '8px 12px';
    bar.style.borderRadius = '8px';
    bar.style.background = 'rgba(31,35,40,.92)';
    bar.style.color = '#fff';
    bar.style.fontSize = '12px';
    bar.style.lineHeight = '1.4';
    bar.style.boxShadow = '0 4px 16px rgba(0,0,0,.25)';

    const text = document.createElement('span');
    text.textContent = '采集中…';
    bar.appendChild(text);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '取消';
    btn.style.cursor = 'pointer';
    btn.style.border = '1px solid rgba(255,255,255,.5)';
    btn.style.borderRadius = '6px';
    btn.style.background = 'transparent';
    btn.style.color = '#fff';
    btn.style.fontSize = '12px';
    btn.style.padding = '2px 8px';
    btn.addEventListener('click', () => { cancelled = true; });
    bar.appendChild(btn);
    return { bar, text, btn };
  }

  // 轻提示（替代 alert）：复用浮层样式, 无按钮, ms 后自动消失
  function showToast(text, ms) {
    const { bar } = buildOverlay();
    bar.removeChild(bar.lastChild); // 去掉取消按钮
    bar.firstChild.textContent = text;
    document.body.appendChild(bar);
    setTimeout(() => { if (bar.parentNode) bar.parentNode.removeChild(bar); }, ms || 3000);
  }

  // —— 全量采集入口：从当前可视位置向上滚动加载历史, 每步跑 collectMessages
  //    并按身份去重合并；结束（完成/取消/超时）一律恢复初始滚动位置 ——
  async function collectAllMessages() {
    const scroller = findScroller();
    const initialScrollTop = scroller.scrollTop;
    cancelled = false;

    // msgKey -> { role, text, step, idx }:
    //   step = 捕获时的滚动步序号（首轮视口记 0，循环内 steps++ 后为 1,2,3…，
    //         步序号越大 = 捕获越晚 = 内容越老）
    //   idx  = 该步 collectMessages 的 DOM 枚举序（forEach 双参索引）
    const seen = new Map();
    const absorb = (msgs, step) => {
      msgs.forEach((m, idx) => {
        const k = msgKey(m);
        if (seen.has(k)) return; // 身份去重：同一条消息只留首捕样本
        seen.set(k, { role: m.role, text: m.text, step, idx });
      });
    };

    const { bar, text } = buildOverlay();
    document.body.appendChild(bar);
    // 采集开始前先告知行为（首次导出会自动回滚加载历史）
    text.textContent = '首次导出会自动回滚加载历史，可能需要数十秒';

    const t0 = Date.now();
    let steps = 0;
    let stall = 0;
    try {
      // 先收当前视口一轮（不必先滚），步序号记 0（最新）
      absorb(collectMessages(), 0);
      text.textContent = '采集中… 已捕获 ' + seen.size + ' 条';

      while (steps < MAX_STEPS && Date.now() - t0 < TOTAL_TIMEOUT && !cancelled) {
        steps++;
        const before = seen.size;
        // 从当前位置向上滚动一步，加载更早的历史
        scroller.scrollTop = Math.max(0, scroller.scrollTop - STEP_PX);
        await sleep(STEP_DELAY);
        absorb(collectMessages(), steps);
        text.textContent = '采集中… 已捕获 ' + seen.size + ' 条';
        // 到顶且连续两轮无新增 → 历史已加载完
        if (seen.size === before && scroller.scrollTop <= 0) {
          stall++;
          if (stall >= STALL_LIMIT) break;
        } else {
          stall = 0;
        }
      }
    } finally {
      // 无论完成 / 取消 / 超时, 都把视口还原到进入时的位置
      scroller.scrollTop = initialScrollTop;
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    }

    // 全局排序（零布局依赖）：采集从底部(新)向上(老)滚，捕获步序号即时间序 ——
    // 步序号越大越老、排越前；同步内 idx 为 collectMessages 的 DOM 自然枚举序。
    // （禁用一切布局坐标：真机实测坐标链在滚动容器下分叉，累加值系统性偏差）
    return Array.from(seen.values()).sort((a, b) => {
      if (a.step !== b.step) return b.step - a.step;
      return a.idx - b.idx;
    }).map((m) => ({ role: m.role, text: m.text }));
  }

  function toMarkdown(msgs) {
    const lines = [];
    lines.push('# ' + (document.title || '豆包对话'));
    lines.push('');
    lines.push('> 导出时间: ' + new Date().toLocaleString('zh-CN'));
    lines.push('> URL: ' + location.href);
    lines.push('');
    msgs.forEach((m) => {
      lines.push('## ' + (m.role === 'user' ? '👤 用户' : '🤖 AI'));
      lines.push('');
      lines.push(m.text);
      lines.push('');
    });
    return lines.join('\n');
  }

  function toJSON(msgs) {
    return JSON.stringify({
      title: document.title,
      url: location.href,
      exportedAt: new Date().toISOString(),
      messages: msgs.map((m) => ({ role: m.role, text: m.text })),
    }, null, 2);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  dwt.exportModule = {
    collectMessages,
    collectAllMessages,
    toMarkdown,
    toJSON,
    async exportMarkdown() {
      const msgs = await collectAllMessages();
      if (!msgs.length) { showToast('未找到对话内容', 3000); return; }
      download('doubao-chat-' + Date.now() + '.md', toMarkdown(msgs), 'text/markdown');
    },
    async exportJSON() {
      const msgs = await collectAllMessages();
      if (!msgs.length) { showToast('未找到对话内容', 3000); return; }
      download('doubao-chat-' + Date.now() + '.json', toJSON(msgs), 'application/json');
    },
  };

  window.addEventListener('dwt-export-chat', (e) => {
    const fmt = e.detail?.format || 'md';
    if (fmt === 'json') dwt.exportModule.exportJSON();
    else dwt.exportModule.exportMarkdown();
  });

  // —— 右下角 🧰 菜单入口：与 batch 面板同一套 dwt.rail 注册机制 ——
  // rail 属 critical 模块，与本可选模块无先后保证：未就绪时 attempt<25 重试
  // （参考 panel.js registerBatchRail 模式；onClick 直查 dwt.exportModule，
  //  热重载后永远走最新闭包，无需 remove+add 闪菜单）
  function registerExportRail(attempt) {
    if (dwt.rail && dwt.rail.add) {
      // 已注册过（重复执行/热重载）则只补可见性，避免闪菜单
      const existed = dwt.rail.getEl && dwt.rail.getEl('export-md');
      if (existed) {
        try {
          dwt.rail.setVisible && dwt.rail.setVisible('export-md', true);
          dwt.rail.setVisible && dwt.rail.setVisible('export-json', true);
        } catch (_) {}
        return true;
      }
      dwt.rail.add({
        id: 'export-md',
        icon: '📄',
        title: '导出 Markdown',
        order: 2,
        onClick: () => { dwt.exportModule.exportMarkdown(); },
      });
      dwt.rail.add({
        id: 'export-json',
        icon: '📦',
        title: '导出 JSON',
        order: 3,
        onClick: () => { dwt.exportModule.exportJSON(); },
      });
      return true;
    }
    if ((attempt || 0) < 25) {
      setTimeout(() => registerExportRail((attempt || 0) + 1), 200);
    }
    return false;
  }
  registerExportRail(0);

  console.log('[cs][doubao-web-toolkit] export module ready (scroll-collect)');
})();
