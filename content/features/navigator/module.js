// navigator/module.js — 对话导航: 提取用户问题 → 侧边快速跳转
// 顶部维护:
//   - 2026-10-16 美化: 宽 200px / 字号 12px / 圆角徽标序号 / hover 微动效 /
//     折叠按钮 / 底部分数统计 / backdrop 毛玻璃 / 自定义细滚动条。
//   - 定位右侧 (豆包左侧有 280px 会话栏), top:84px 避开顶部栏。
//   - 2026-10-17 采集去卡顿: 不再开机强制顶→底滚扫；优先 DOM/Fiber，
//     自然滚动 + MutationObserver 增量合并。
//   - 2026-10-17 rev5: 取消自动 softSweep（刷新后仍会顶→底拖滚动）；采集纯被动，
//     未挂载历史靠用户自然滚动补齐。软扫代码保留但默认不调度。
//   - 2026-10-17 rev6: 优先 CSS 美化豆包原生左侧 gutter（滑动已有标题浮层）；
//     检测到 gutter 则隐藏 #dwt-nav，只补刻度/浮层样式 + 轻量总数徽标。
//   - 2026-10-17 rev7: 将原生 gutter 用 CSS 挪到右侧（对齐原 #dwt-nav：right:12px），
//     继续隐藏自绘导航，仅美化原生刻度 + 浮层 + 总数。
//   - 2026-10-17 rev8: 修复 gutter CSS 过激导致原生消失、#dwt-nav 被卸掉后双无；
//     仅定位 aside[class*="gutter"]，可见性检查失败则回退面板。
//   - 2026-10-17 rev9: gutter 成功时不再 remove #dwt-nav（仅 CSS 隐藏）；同 rev 重注入
//     若面板缺失且非 gutter-ok 则强制 remount，避免 stub 循环后双无。
//   - 2026-10-17 rev10: gutter 挪右时强制 min-width:34px，避免 aside 塌成 ~3px；
//     美化失败则永久放弃 gutter、卸样式不残废原生，并强制 #dwt-nav 可见（不闪卸）。
//   - 2026-10-18 rev11: 挪右后宿主 onWheel 不再驱动主列表（absolute 坐标失效）；
//     gutter 改为 position:fixed，并在刻度列 capture 滚轮桥接到 v_list_scroller。
//   - 2026-10-18 rev16: 曾关 gutter 挪右（误判）；用户要的是「美化原生栏放右边」。
//   - 2026-10-18 rev18: 恢复原生 gutter 挪右美化；成功后强制隐藏 #dwt-nav（禁止双栏/闪烁）；
//     高亮改为原生刻度；滚轮桥接保留；短暂布局抖动不回退面板。
  //   - 2026-10-18 rev19: 截图验收——右侧仅细条无关键字；原生 tip 层挪右后为空。
  //     增加 #dwt-gutter-labels 关键字轨（布局对齐原 #dwt-nav），悬停/滑动显示标题。
  //   - 2026-10-18 rev20: labels/tip 接入 enable/disable/destroy/滚轮桥；刻度悬停 tip；
  //     销毁清理 #dwt-gutter-labels/#dwt-gutter-tip/#dwt-gutter-count。
  //   - 2026-10-18 rev21: postNavBeacon 上报 labels/tip；滑动持续 tip。
  //   - 2026-10-18 rev22: syncGutterLabels 节流上报 labels/tip（stub 覆盖时仍可验）。
  //   - 2026-10-18 rev23: 导航文案必须与真实用户气泡一一对应——过滤 dwt-batch-probe；
  //     Fiber 无 DOM 重叠时丢弃（防污染拼接）；bubbleText 只取气泡主文案；
  //     gutter 刻度 title/aria 作补充源；行上 data-text 供验收（避免读到「1枫」序号粘连）。
  //   - 2026-10-18 rev24: 双源对齐——Fiber 仅当含 DOM 连续子序列时才采用全量；
  //     否则 mergeExtendOnly（禁止脏源盲追加）；刻度 title 仅 DOM 空时兜底；
  //     looksUser 拒 assistant/bot；dedupePreserveOrder 保序去重。
  //   - 2026-10-18 rev25: jumpTo/findBubble 与 navList 同一套 resolveNavJumpKey
  //     （normalize + eligible）；精确相等定位，禁止 startsWith/includes 串项。
  //   - 2026-10-18 rev26: postNavBeacon 附带 buildNavAlignReport（bubbles/navTexts/
  //     aligned/mismatch/probeFiltered）；serve 落盘 .last-nav-align.json。
  //   - 2026-10-18 rev27: #dwt-gutter-labels / tip 观感对齐自定义 #dwt-nav
  //     （宽/毛玻璃/圆角阴影/行距序号/高亮 hover/头脚）；刻度条仍靠右；tip 浅色气泡仅悬停。
  //   - 2026-10-18 rev28: jumpTo 带 navList index；findBubble 索引优先（短/重复文案
  //     不再只靠全局首个精确串）；比例预滚 + scrollIntoView(auto)；beacon 报 jumpOk。
  //   - 2026-10-18 rev29: jumpOk 判定延后等虚拟列表 layout；保留 rev28 索引优先 + 样式对齐。
  //   - 2026-10-18 rev30: 破 wheel→markCurrent→syncGutterLabels(innerHTML+scrollIntoView)
  //     反馈环；列表仅 navList 变化时重建，高亮 class 切换；程序化 scroll 抑制再 sync。
  //   - 2026-10-18 rev31: buildNavAlignReport 认挂载窗为 nav 连续子序列；与 rev28–30 跳转/样式并存。
  //   - 2026-10-18 rev32: jump 落点改滚 v_list_scroller.scrollTop（scrollIntoView 常滚错容器）。
  //   - 2026-10-18 rev33: align 报告 bubbles/nav 先 dedupePreserveOrder，再认连续子序列。
  //   - 2026-10-18 rev34/35: 同会话 overlap=0 禁止整表换成视口子集；拒绝缩表；labels 重建 450ms 节流。
  //   - 2026-10-18 rev36: destroy 清除心跳/路由 interval；僵尸闭包 isActiveNav 短路（多实例抢 labels 根因）。
  //   - 2026-10-19 rev38: 刻度挤在栏顶的根因 = rev19 起给原生刻度列写 `padding: 8px 0 !important`，
  //     压掉了豆包自己的内联 `padding-top/bottom: 388px` 居中。改为让原生轨道直接承载自定义导航
  //     列表：刻度内容整条隐藏，#dwt-gutter-labels 挂进 aside 并成为卡片本体（不再是独立浮层）；
  //     aside 定位模型保持豆包原样（top/bottom 拉满 —— 实测把 bottom 改 auto 会被豆包自己
  //     按容器高度隐藏轨道内容），空档 pointer-events:none 点透；配色走 --dwt-* 变量跟随深/浅外观。
  //     （注：rev37 只改了 CSS 文本没升 rev，同 rev 重注入会沿用旧闭包里的旧 CSS —— 改样式必升 rev。）
  //   - 2026-10-19 rev39: rev38 真机白屏：隐藏原生刻度内容的 `aside > div` 一刀切，把同为直接
  //     子节点的 #dwt-gutter-labels 卡片也 display:none 了（矩形 0×0）。改为
  //     `aside > div:not(#dwt-gutter-labels)`。
  //   - 2026-10-19 rev40: 深色下当前行蓝字对比度不足（--dwt-accent 无深色档）→ 卡片内就地覆盖
  //     #4d8bf5 / #7fb0ff（与面板 .dwt-nav-dark 同套），不动 common.css 共享变量。
  //   - 2026-10-19 rev41: ①空会话（navList 为空且无原生轨道）不再挂一块「暂无提问」空卡：
  //     只 display:none，节点留着给 live-boot/inject.js 的存在性验收；gutter 卡片同规则。
  //     ②enableGutterMode 的三层 rAF 加 900ms setTimeout 看门狗 —— 后台标签 rAF 被渲染器饿死
  //     （实测 visibilityState=visible 却 1.8s 内 0 次回调），finish 永不执行会让 gutterMode 卡
  //     false，心跳每 2.5s 重建整表。③mode()/beacon 的 navMode 改以 DOM 事实为准（html 类），
  //     内存标志滞后时不再误报 panel。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  // 防重复注入：同 revision 再挂只同步 z-index；revision 升了则先 destroy 再装新逻辑
  const NAV_REV = 43;
  // 用户目标：美化原生导航栏并放到右边（不是自定义 #dwt-nav）
  const USE_NATIVE_GUTTER_CSS = true;
  if (dwt.navigatorModule && dwt.navigatorModule.rev === NAV_REV) {
    console.log('[cs][doubao-web-toolkit] navigator already mounted, skip re-init');
    try {
      if (typeof dwt.navigatorModule.ensureNavAlive === 'function') {
        dwt.navigatorModule.ensureNavAlive();
      }
      if (typeof dwt.navigatorModule.markCurrent === 'function') {
        dwt.navigatorModule.markCurrent();
      }
    } catch (e) { /* ignore */ }
    return;
  }
  if (dwt.navigatorModule) {
    try { dwt.navigatorModule.destroy?.(); } catch (e) { /* 旧版无 destroy 时忽略 */ }
    try {
      document.getElementById('dwt-nav')?.remove();
      document.getElementById('dwt-nav-style')?.remove();
      document.getElementById('dwt-gutter-style')?.remove();
      document.getElementById('dwt-gutter-count')?.remove();
      document.getElementById('dwt-gutter-labels')?.remove();
      document.getElementById('dwt-gutter-tip')?.remove();
    } catch (e) { /* DOM 清理失败不阻断重装 */ }
    dwt.navigatorModule = null;
  }

  const SEL_USER_BUBBLE_DEFAULT = '[class*="bg-g-send-msg-bubble-bg"]';
  function userBubbleSel() {
    return dwt.selectorManager?.getUserBubble?.() || SEL_USER_BUBBLE_DEFAULT;
  }
  const PANEL_ID = 'dwt-nav';
  const STYLE_ID = 'dwt-nav-style';
  const GUTTER_STYLE_ID = 'dwt-gutter-style';
  const GUTTER_COUNT_ID = 'dwt-gutter-count';
  const GUTTER_LABELS_ID = 'dwt-gutter-labels';
  const GUTTER_TIP_ID = 'dwt-gutter-tip';
  // 只认带 gutter 哈希的 aside，避免误伤其它 left-12 侧栏
  const SEL_GUTTER_ASIDE = 'aside[class*="gutter"]';
  const SEL_GUTTER_TICKS = 'aside[class*="gutter"] [class*="w-34"]';
  let navList = [];
  let keyword = '';
  let collapsed = false;

  // ⓘ 用法说明：导航标题右侧（内置导航栏 head 与回退面板标题共用同一份）
  const HELP = {
    title: '📌 提问导航',
    desc: '把当前会话的提问列成目录：点一条跳过去，滚动时自动高亮「现在看到哪」。',
    rows: [
      ['怎么用', '点一条跳转；鼠标在列表上滚轮也能带动主对话'],
      ['搜索', '输入关键字过滤提问（只筛列表，不动会话）'],
      ['底部计数', '点一下切换「铺开全部 / 收起高度」'],
      ['收起', '标题右侧 ◀ / ▶'],
    ],
    sections: [{
      h: '两种形态',
      rows: [
        ['内置导航栏', '列表挂在豆包原生右侧导航条里（本机取得到就用这个，顺带替掉原生样式）'],
        ['回退浮层', '原生导航条取不到时，退回右侧独立面板'],
      ],
    }],
    note: '纯读页面里的提问文本，不发请求、不改内容；列表自己滚轮是单向驱动主区（高亮由主区滚动被动跟随），避免两边互相打架。',
  };
  // true = 尽量一屏铺开全部条目（仍受视口高度限制）；false = 紧凑高度
  let fitAll = true;

  let scanning = false;
  let scanGen = 0;           // 切换会话时自增，作废进行中的扫描
  let activeChatId = '';     // 当前 URL 里的 /chat/<id>
  let lastFullScanChatId = '';
  let lastFullScanAt = 0;
  let userInterruptGen = 0;  // 用户滚轮/触摸时自增（jumpTo 也会记一笔）

  // 自动化探针 / 验收噪声：会出现在真实气泡里，但不是用户「真实提问」
  function isProbeText(text) {
    const t = String(text || '');
    return /^dwt-batch-probe\b/i.test(t)
      || /^dwt-probe\b/i.test(t)
      || /\bjsdom-critical-probe\b/i.test(t);
  }

  function normalizeNavText(raw) {
    // 保留中文提问：只折叠空白，不改写汉字/标点；统一截断到 80
    return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function isEligibleNavText(text) {
    const t = normalizeNavText(text);
    if (!t) return false;
    if (isProbeText(t)) return false;
    return true;
  }

  // 保序去重：同一提问只留首次出现，避免 Fiber/DOM 双源叠出重复行
  function dedupePreserveOrder(arr) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < (arr || []).length; i++) {
      const t = normalizeNavText(arr[i]);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  // 只取气泡主文案：去掉操作条/隐藏节点，避免 innerText 拼进无关 UI 或只露出脏片段
  function bubbleText(node) {
    if (!node) return '';
    try {
      const clone = node.cloneNode(true);
      clone.querySelectorAll(
        '[class*="message-action"], [class*="action-bar"], [class*="toolbar"],'
        + 'button, svg, style, script, [aria-hidden="true"]'
      ).forEach((el) => { try { el.remove(); } catch (e) { /* ignore */ } });
      const t = normalizeNavText(clone.innerText || clone.textContent || '');
      if (isEligibleNavText(t)) return t;
    } catch (e) { /* fall through */ }
    const fallback = normalizeNavText(node.innerText || node.textContent || '');
    return isEligibleNavText(fallback) ? fallback : '';
  }

  function visibleTexts() {
    const out = [];
    document.querySelectorAll(userBubbleSel()).forEach((node) => {
      const text = bubbleText(node);
      if (text) out.push(text);
    });
    return out;
  }

  // 原生 gutter 刻度 title/aria：不可靠（常错位/UI 文案），仅 DOM 全空时兜底
  function harvestGutterTickTitles() {
    const out = [];
    const seen = new Set();
    const root = document.querySelector(SEL_GUTTER_ASIDE) || document.querySelector(SEL_GUTTER_TICKS);
    if (!root) return out;
    // 自家卡片也在轨道里：标题右侧的 ⓘ 是 button 且 aria-label="用法说明"，
    // 不过滤就会在「气泡采集为空」的兜底路径里被当成一条提问收进来（真机复现过）。
    const ownCard = document.getElementById(GUTTER_LABELS_ID);
    root.querySelectorAll('button, [role="button"], [class*="rounded-full"]').forEach((el) => {
      if (ownCard && ownCard.contains(el)) return;
      const raw = el.getAttribute('title')
        || el.getAttribute('aria-label')
        || el.getAttribute('data-title')
        || '';
      const t = normalizeNavText(raw);
      if (!isEligibleNavText(t) || seen.has(t)) return;
      // 过短/纯数字/明显 UI 铬不要（防 title 污染导航）
      if (/^\d+$/.test(t) || t.length < 1) return;
      if (/^(导航|消息|滚动|回到|顶部|底部)$/i.test(t)) return;
      seen.add(t);
      out.push(t);
    });
    return out;
  }

  function sameSlice(a, a0, b, b0, n) {
    for (let i = 0; i < n; i++) {
      if (a[a0 + i] !== b[b0 + i]) return false;
    }
    return true;
  }

  // 虚拟列表每次只挂载视口附近的气泡。按重叠把新窗口接到已收集列表的头部或尾部。
  // 仅用于「可信 DOM↔DOM」合并；允许无重叠时追加未见项（跳窗）。
  function mergeTexts(base, visible) {
    if (!visible.length) return base.slice ? base.slice() : [];
    if (!base.length) return visible.slice();
    if (visible.length <= base.length) {
      for (let i = 0; i <= base.length - visible.length; i++) {
        if (sameSlice(base, i, visible, 0, visible.length)) return base.slice ? base.slice() : base;
      }
    }
    const maxK = Math.min(base.length, visible.length);
    for (let k = maxK; k >= 1; k--) {
      if (sameSlice(base, base.length - k, visible, 0, k)) return base.concat(visible.slice(k));
    }
    for (let k = maxK; k >= 1; k--) {
      if (sameSlice(visible, visible.length - k, base, 0, k)) {
        return visible.slice(0, visible.length - k).concat(base);
      }
    }
    // 无连续重叠：去重后追加（虚拟列表跳窗）。脏 Fiber/刻度禁止走此路径。
    const baseSet = new Set(base);
    return base.concat(visible.filter((t) => !baseSet.has(t)));
  }

  // 脏源扩展：只做两端连续重叠拼接，绝不盲追加无重叠的「新」项（防串项/助手泄漏）
  function mergeExtendOnly(trusted, candidate) {
    if (!candidate.length) return trusted.slice();
    if (!trusted.length) return candidate.slice();
    if (candidate.length <= trusted.length) {
      for (let i = 0; i <= trusted.length - candidate.length; i++) {
        if (sameSlice(trusted, i, candidate, 0, candidate.length)) return trusted.slice();
      }
    }
    const maxK = Math.min(trusted.length, candidate.length);
    for (let k = maxK; k >= 1; k--) {
      if (sameSlice(trusted, trusted.length - k, candidate, 0, k)) {
        return trusted.concat(candidate.slice(k));
      }
    }
    for (let k = maxK; k >= 1; k--) {
      if (sameSlice(candidate, candidate.length - k, trusted, 0, k)) {
        return candidate.slice(0, candidate.length - k).concat(trusted);
      }
    }
    return trusted.slice();
  }

  // Fiber 必须把当前 DOM 气泡当作连续子序列，才采纳 Fiber 全量（含未挂载历史）；
  // 否则只做两端扩展，失败则纯 DOM——杜绝中间夹脏/顺序错位。
  function alignFiberToDom(fiberTexts, domTexts) {
    const fiber = dedupePreserveOrder((fiberTexts || []).filter(isEligibleNavText));
    const dom = dedupePreserveOrder((domTexts || []).filter(isEligibleNavText));
    if (!fiber.length) return dom;
    if (!dom.length) return fiber;
    for (let i = 0; i <= fiber.length - dom.length; i++) {
      if (sameSlice(fiber, i, dom, 0, dom.length)) return fiber;
    }
    return mergeExtendOnly(dom, fiber);
  }

  // jumpTo 定位键：与写入 navList 的 normalize/eligible 完全一致（空白折叠 + 截断 + 拒探针）
  function resolveNavJumpKey(text) {
    const t = normalizeNavText(text);
    return isEligibleNavText(t) ? t : '';
  }

  // 纯函数：列表项文案 → 目标气泡下标。
  // preferIndex：navList[i] 跳转时优先 bubbles[i]（短/重复文案防串到全局首个命中）。
  function matchListTextToBubbleIndex(listText, bubbleTexts, preferIndex) {
    const want = resolveNavJumpKey(listText);
    if (!want) return -1;
    const arr = bubbleTexts || [];
    const pref = (typeof preferIndex === 'number' && preferIndex >= 0) ? preferIndex : -1;
    if (pref >= 0 && pref < arr.length) {
      const at = resolveNavJumpKey(arr[pref]);
      if (at && at === want) return pref;
    }
    const hits = [];
    for (let i = 0; i < arr.length; i++) {
      const bt = resolveNavJumpKey(arr[i]);
      if (bt && bt === want) hits.push(i);
    }
    if (!hits.length) return -1;
    if (pref >= 0) {
      if (hits.indexOf(pref) >= 0) return pref;
      let best = hits[0];
      let bestD = Math.abs(best - pref);
      for (let h = 1; h < hits.length; h++) {
        const d = Math.abs(hits[h] - pref);
        if (d < bestD) { bestD = d; best = hits[h]; }
      }
      return best;
    }
    return hits[0];
  }

  // 纯函数：构建 nav↔bubble 对齐报告（验收落盘 / 静态测共用）
  // 虚拟列表只挂载窗口：优先认 bubbles 为 navTexts 的连续子序列；否则回退前缀逐项比对。
  function buildNavAlignReport(bubbles, navTexts, extra) {
    const b = dedupePreserveOrder((bubbles || []).filter(isEligibleNavText));
    const n = dedupePreserveOrder((navTexts || []).filter(isEligibleNavText));
    const aligned = [];
    const mismatch = [];
    let windowStart = -1;
    if (b.length && n.length >= b.length) {
      for (let i = 0; i <= n.length - b.length; i++) {
        let ok = true;
        for (let j = 0; j < b.length; j++) {
          if (n[i + j] !== b[j]) { ok = false; break; }
        }
        if (ok) { windowStart = i; break; }
      }
    }
    if (windowStart >= 0) {
      for (let j = 0; j < b.length; j++) aligned.push(true);
    } else {
      const cmpN = Math.min(b.length, n.length);
      for (let i = 0; i < cmpN; i++) {
        const eq = b[i] === n[i];
        aligned.push(!!eq);
        if (!eq) mismatch.push({ i: i, bubble: b[i] || null, nav: n[i] || null });
      }
    }
    const probeFiltered = !b.some(isProbeText) && !n.some(isProbeText);
    const cmpN = Math.min(b.length, n.length);
    return Object.assign({
      bubbles: b,
      navTexts: n,
      aligned: aligned,
      mismatch: mismatch,
      lengthGap: b.length !== n.length,
      windowStart: windowStart,
      allAligned: (windowStart >= 0 && b.length > 0)
        || (cmpN > 0 && mismatch.length === 0 && aligned.length > 0 && aligned.every(Boolean)),
      probeFiltered: probeFiltered,
    }, extra || {});
  }

  function getScroller() {
    const fromManager = dwt.selectorManager?.getScroller?.();
    if (fromManager) return fromManager;
    return document.querySelector('[class*="v_list_scroller"]');
  }

  function collectUserQuestions() {
    return navList.length
      ? navList.map((item) => ({ text: item.text }))
      : visibleTexts().map((text) => ({ text }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    // 浅色 (默认) + 深色 (body 背景偏暗时自动切换, 见 applyDark())
    st.textContent = `
      #dwt-nav {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background:rgba(255,255,255,0.96);
        border:1px solid rgba(0,0,0,0.06);
        box-shadow:0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
        color:#1f2328;
        overflow:hidden;
        box-sizing:border-box;
      }
      #dwt-nav .dwt-nav-body {
        display:flex; flex-direction:column; flex:1 1 auto;
        min-height:0; overflow:hidden;
      }
      #dwt-nav .dwt-nav-footer { flex-shrink:0; cursor:pointer; user-select:none; }
      #dwt-nav .dwt-nav-footer:hover { color:#2d72de; }
      #dwt-nav.dwt-nav-fitall .dwt-nav-rows { overflow-y:auto; }
      #dwt-nav .dwt-nav-header { color:#1f2328; }
      #dwt-nav .dwt-nav-collapse { color:#8b949e; }
      #dwt-nav .dwt-nav-collapse:hover { background:#f0f2f5; }
      #dwt-nav .dwt-nav-search { border:1px solid #d0d7de; color:#1f2328; background:#fff; }
      #dwt-nav .dwt-nav-search::placeholder { color:#8b949e; }
      #dwt-nav .dwt-nav-search:focus { border-color:#2d72de; box-shadow:0 0 0 3px rgba(45,114,222,.15); }
      #dwt-nav .dwt-nav-footer { border-top-color:#f0f2f5; color:#8b949e; }
      #dwt-nav .dwt-nav-rows {
        overflow-x:hidden; overflow-y:auto; flex:1 1 auto; min-height:0;
      }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar { width:4px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-thumb { background:#d0d7de; border-radius:2px; }
      #dwt-nav .dwt-nav-rows::-webkit-scrollbar-track { background:transparent; }
      #dwt-nav .dwt-nav-row {
        display:flex; align-items:center; gap:5px;
        padding:3px 5px; border-radius:5px; cursor:pointer;
        transition: background .12s ease;
      }
      #dwt-nav .dwt-nav-row:hover { background:#f0f4ff; }
      #dwt-nav .dwt-nav-row.dwt-nav-current {
        background:#e8f0ff;
        color:#2d72de;
        box-shadow: inset 3px 0 0 #2d72de;
      }
      #dwt-nav .dwt-nav-num {
        flex-shrink:0; width:20px; height:20px; border-radius:50%;
        background:#f0f2f5; color:#656d76; font-size:10px; font-weight:600;
        display:flex; align-items:center; justify-content:center;
        transition: background .12s;
      }
      #dwt-nav .dwt-nav-row:hover .dwt-nav-num { background:#dde7ff; color:#2d72de; }
      #dwt-nav .dwt-nav-text {
        flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        color:#1f2328; font-size:12px; line-height:1.4;
      }
      #dwt-nav .dwt-nav-row.dwt-nav-current .dwt-nav-text { color:#1a56db; font-weight:500; }
      #dwt-nav .dwt-nav-empty { color:#8b949e; padding:6px; text-align:center; font-size:11px; }
      #dwt-nav.dwt-nav-collapsed .dwt-nav-body,
      #dwt-nav.dwt-nav-collapsed .dwt-nav-footer { display:none !important; }

      /* === 深色模式: !important 覆盖 inline style === */
      #dwt-nav.dwt-nav-dark {
        background:rgba(28,29,32,0.92) !important;
        border:1px solid rgba(255,255,255,0.1) !important;
        box-shadow:0 8px 28px rgba(0,0,0,0.6) !important;
        color:#e6e8ea !important;
      }
      #dwt-nav.dwt-nav-dark > div:first-child > div:first-child { color:#e6e8ea !important; } /* 标题 */
      #dwt-nav.dwt-nav-dark > div:first-child > span { color:#8b949e !important; } /* 折叠按钮 */
      #dwt-nav.dwt-nav-dark #dwt-nav-search {
        border:1px solid rgba(255,255,255,0.18) !important;
        color:#e6e8ea !important;
        background:rgba(255,255,255,0.05) !important;
      }
      #dwt-nav.dwt-nav-dark #dwt-nav-search::placeholder { color:#8b949e !important; }
      #dwt-nav.dwt-nav-dark #dwt-nav-search:focus {
        border-color:#4d8bf5 !important;
        box-shadow:0 0 0 3px rgba(77,139,245,.25) !important;
      }
      #dwt-nav.dwt-nav-dark .dwt-nav-footer {
        border-top:1px solid rgba(255,255,255,0.1) !important;
        color:#8b949e !important;
      }
      #dwt-nav.dwt-nav-dark .dwt-nav-rows::-webkit-scrollbar-thumb { background:#4b4d52; }
      #dwt-nav.dwt-nav-dark .dwt-nav-row:hover { background:rgba(255,255,255,0.06); }
      #dwt-nav.dwt-nav-dark .dwt-nav-row.dwt-nav-current { background:rgba(77,139,245,0.18); color:#4d8bf5; }
      #dwt-nav.dwt-nav-dark .dwt-nav-num { background:rgba(255,255,255,0.08); color:#9aa0a6; }
      #dwt-nav.dwt-nav-dark .dwt-nav-row:hover .dwt-nav-num { background:rgba(77,139,245,0.2); color:#4d8bf5; }
      #dwt-nav.dwt-nav-dark .dwt-nav-text { color:#e6e8ea; }
      #dwt-nav.dwt-nav-dark .dwt-nav-row.dwt-nav-current .dwt-nav-text { color:#7fb0ff; font-weight:500; }
      #dwt-nav.dwt-nav-dark .dwt-nav-empty { color:#8b949e; }
    `;
    document.head.appendChild(st);
  }

  // 检测深色: 读页面真实容器的背景亮度.
  // 不依赖 prefers-color-scheme —— 豆包可能自己切换主题而不响应系统设置.
  function isDarkNow() {
    // 优先用「外观跟随」模块的结论：它读豆包自己的 data-theme，比背景亮度更权威
    try {
      const sig = window.dwt?.themeModule?.isDark;
      if (typeof sig === 'function') return !!sig();
    } catch (_) { /* 回退到亮度探测 */ }
    try {
      // 优先: body 直接是纯色背景 (豆包浅色模式常见)
      let bg = getComputedStyle(document.body).backgroundColor;
      // 兜底: body 透明时, 从消息区容器往上找第一个非透明背景
      if (!bg || bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) {
        const candidates = document.querySelector('[class*="scroller"]')
                       || document.querySelector('[class*="message-list"]')
                       || document.querySelector('main');
        let el = candidates;
        while (el && el !== document.documentElement) {
          const c = getComputedStyle(el).backgroundColor;
          if (c && !c.startsWith('rgba(0, 0, 0, 0)') && c !== 'transparent') { bg = c; break; }
          el = el.parentElement;
        }
      }
      const m = bg?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return lum < 100;  // 经验阈值
      }
    } catch (e) { /* 忽略 */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  function applyDark() {
    try {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      const dark = isDarkNow();
      panel.classList.toggle('dwt-nav-dark', dark);
    } catch (e) { /* 深色检测失败不影响面板显示 */ }
  }

  let themeHooked = false;
  // 面板用的是平行配色类（不是 CSS 变量），豆包切外观时不会自己翻转：
  // theme 模块在 dwt-ui-dark 变化后派发 dwt:themechange，这里跟着重算。
  function hookThemeChanges() {
    if (themeHooked) return;
    themeHooked = true;
    try { document.addEventListener('dwt:themechange', () => { applyDark(); }); } catch (_) { /* 忽略 */ }
  }

  function renderItems() {
    // 注: 这里用 class 选择器, 因为面板内容器是 class 不是 id
    const box = document.querySelector('#' + PANEL_ID + ' .dwt-nav-rows');
    if (!box) return;
    const kw = keyword.trim().toLowerCase();
    const rows = [];
    navList.forEach((q, i) => {
      if (kw && !q.text.toLowerCase().includes(kw)) return;
      const raw = normalizeNavText(q.text);
      rows.push(
        '<div class="dwt-nav-row" data-idx="' + i + '" data-text="' + escapeHtml(raw).replace(/"/g, '&quot;') + '">'
        + '<span class="dwt-nav-num">' + (i + 1) + '</span>'
        + '<span class="dwt-nav-text">' + escapeHtml(raw) + '</span>'
        + '</div>'
      );
    });
    // 无匹配 = 有提问但被关键字滤掉；暂无提问 = 这个会话本来就没有提问（与 gutter 文案一致）
    const emptyText = navList.length ? '无匹配' : '暂无提问';
    box.innerHTML = rows.length ? rows.join('')
      : '<div style="color:#8b949e;padding:6px;text-align:center;font-size:11px;">' + emptyText + '</div>';
    const footer = document.querySelector('#' + PANEL_ID + ' .dwt-nav-footer');
    if (footer) {
      if (scanning) footer.textContent = '补全中… 已 ' + navList.length + ' 条';
      else {
        footer.textContent = '共 ' + navList.length + ' 条';
      }
    }
    applyFitAll();
    // 空会话收起 / 有内容再放出（含会话切换后列表清空）
    syncEmptyVisibility();
    // gutter 模式下列表变化时同步关键字轨
    if (gutterMode || document.documentElement.classList.contains('dwt-native-gutter')) {
      try { syncGutterLabels(); } catch (e) { /* ignore */ }
    }
  }

  // 铺开模式：面板随内容长高（上限为视口），能放下就整表可见不用滚；放不下才在列表内滚
  // 紧凑模式：列表固定约 6～7 行高度，底部「点击铺开全部」才有可见效果
  const COMPACT_ROWS_MAX = '168px';
  function applyFitAll() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || collapsed) return;
    const body = panel.querySelector('.dwt-nav-body');
    const rows = panel.querySelector('.dwt-nav-rows');
    panel.classList.toggle('dwt-nav-fitall', fitAll);
    // 最高不超过视口 60%，超出在列表内滚动
    panel.style.maxHeight = '60vh';
    if (fitAll) {
      panel.style.height = 'auto';
      if (body) body.style.flex = '0 1 auto';
      if (rows) {
        rows.style.flex = '0 1 auto';
        rows.style.maxHeight = 'none';
        rows.style.overflowY = 'auto';
      }
    } else {
      panel.style.height = '';
      if (body) body.style.flex = '1 1 auto';
      if (rows) {
        rows.style.flex = '1 1 auto';
        rows.style.maxHeight = COMPACT_ROWS_MAX;
        rows.style.overflowY = 'auto';
      }
    }
  }

  function toggleFitAll() {
    if (scanning) return;
    fitAll = !fitAll;
    applyFitAll();
    renderItems();
  }

  // 高亮当前阅读位置：gutter 模式标原生刻度；面板模式标 #dwt-nav 行
  function markCurrent() {
    if (!isActiveNav()) return;
    if (scanning) return;
    if (gutterMode || document.documentElement.classList.contains('dwt-native-gutter')) {
      markGutterTickCurrent();
      return;
    }
    const panel = document.getElementById(PANEL_ID);
    if (!panel || !navList.length) return;
    const pcs = getComputedStyle(panel);
    if (pcs.display === 'none' || pcs.visibility === 'hidden') return;
    const rows = panel.querySelectorAll('.dwt-nav-row');
    if (!rows.length) return;
    const bestIdx = findCurrentNavIndex();
    rows.forEach((row) => {
      row.classList.toggle('dwt-nav-current', bestIdx >= 0 && Number(row.dataset.idx) === bestIdx);
    });
    if (bestIdx >= 0) {
      const row = panel.querySelector('.dwt-nav-row[data-idx="' + bestIdx + '"]');
      try { row?.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    }
  }

  function findCurrentNavIndex() {
    const scroller = getScroller();
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    const viewH = scroller ? scroller.clientHeight : window.innerHeight;
    let inViewIdx = -1;
    let inViewDist = Infinity;
    let aboveIdx = -1;
    let aboveDist = Infinity;
    document.querySelectorAll(userBubbleSel()).forEach((node) => {
      const text = bubbleText(node);
      if (!text) return;
      const idx = navList.findIndex((item) => item.text === text);
      if (idx < 0) return;
      const rel = node.getBoundingClientRect().top - viewTop;
      if (rel >= -40 && rel <= viewH * 0.85) {
        const dist = Math.abs(rel);
        if (dist < inViewDist) { inViewDist = dist; inViewIdx = idx; }
      } else if (rel < -40) {
        const dist = -rel;
        if (dist < aboveDist) { aboveDist = dist; aboveIdx = idx; }
      }
    });
    return inViewIdx >= 0 ? inViewIdx : aboveIdx;
  }

  function markGutterTickCurrent(opts) {
    const col = findTickColumn();
    const navIdx = findCurrentNavIndex();
    // rev37: 刻度列已被内置列表取代（display:none）→ 不打刻度，只同步列表高亮
    const colHidden = !!col && getComputedStyle(col).display === 'none';
    if (col && !colHidden && col.children.length) {
      // 刻度容器中间层才是按钮列表
      const tickHost = col.querySelector('.relative.flex') || col.children[1] || col;
      const buttons = tickHost.querySelectorAll('button, [class*="rounded-full"]');
      let idx = 0;
      if (buttons.length && navList.length) {
        idx = navIdx >= 0
          ? Math.round((navIdx / Math.max(1, navList.length - 1)) * (buttons.length - 1))
          : 0;
        buttons.forEach((el, i) => {
          el.classList.toggle('dwt-tick-current', i === idx);
          const wrap = el.closest('.relative.flex') || el.parentElement;
          if (wrap && wrap !== col) wrap.classList.toggle('dwt-tick-current', i === idx);
        });
      } else {
        Array.from(col.children).forEach((el, i) => {
          el.classList.toggle('dwt-tick-current', i === 1); // 中间层
        });
      }
    }
    // 默认允许 nearest 跟随；wheel 路径显式传 { skipScroll: true }
    syncGutterLabels(opts || {});
  }

  function collectMountedBubbles() {
    const nodes = [];
    const texts = [];
    document.querySelectorAll(userBubbleSel()).forEach((node) => {
      const t = bubbleText(node);
      if (!t) return;
      nodes.push(node);
      texts.push(t);
    });
    return { nodes: nodes, texts: texts };
  }

  function isBubbleInView(node, sc) {
    if (!node || !node.getBoundingClientRect) return false;
    try {
      const nr = node.getBoundingClientRect();
      if (!(nr.height > 0) || !(nr.width > 0)) return false;
      const sr = sc && sc.getBoundingClientRect
        ? sc.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
      const mid = (nr.top + nr.bottom) / 2;
      return mid >= sr.top - 12 && mid <= sr.bottom + 12;
    } catch (e) {
      return false;
    }
  }

  // listIndex：navList 行下标。优先 DOM 序第 i 个用户气泡（文案须匹配），再按同文出现次序，最后精确串。
  function findBubble(text, listIndex) {
    const want = resolveNavJumpKey(text);
    if (!want) return null;
    const mounted = collectMountedBubbles();
    const nodes = mounted.nodes;
    const texts = mounted.texts;
    if (!nodes.length) return null;
    const pref = (typeof listIndex === 'number' && listIndex >= 0) ? listIndex : -1;

    // 索引优先：挂载窗内第 pref 个用户气泡且文案一致 → 直接命中（短键不串项）
    if (pref >= 0 && pref < nodes.length && resolveNavJumpKey(texts[pref]) === want) {
      return nodes[pref];
    }

    // 全表重复短文案：按 navList 中该 index 之前的同文次数，取挂载窗内第 rank 次
    if (pref >= 0 && navList.length) {
      let rank = 0;
      for (let i = 0; i < pref && i < navList.length; i++) {
        if (resolveNavJumpKey(navList[i] && navList[i].text) === want) rank++;
      }
      let seen = 0;
      for (let i = 0; i < nodes.length; i++) {
        if (resolveNavJumpKey(texts[i]) === want) {
          if (seen === rank) return nodes[i];
          seen++;
        }
      }
    }

    const bi = matchListTextToBubbleIndex(text, texts, pref);
    return bi >= 0 ? nodes[bi] : null;
  }

  // 豆包主列表在自定义 scroller 里：scrollIntoView 常滚 window/错容器，短气泡 mid 落在视口外
  function scrollNodeIntoScroller(node, sc) {
    if (!node) return;
    if (sc) {
      try {
        const nr = node.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        if (nr.height > 0 && sr.height > 0) {
          const delta = ((nr.top + nr.bottom) / 2) - ((sr.top + sr.bottom) / 2);
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          const next = Math.min(max, Math.max(0, sc.scrollTop + delta));
          if (Math.abs(next - sc.scrollTop) > 1) {
            sc.scrollTop = next;
            sc.dispatchEvent(new Event('scroll', { bubbles: true }));
          }
          return;
        }
      } catch (e) { /* fall through */ }
    }
    try { node.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (e2) { /* ignore */ }
  }

  function highlight(node, sc) {
    scrollNodeIntoScroller(node, sc || getScroller());
    const orig = node.style.outline;
    node.style.outline = '2px solid #2d72de';
    node.style.transition = 'outline .3s';
    setTimeout(() => { node.style.outline = orig; }, 1500);
  }

  function stepSize(sc) {
    return Math.max(160, Math.floor(sc.clientHeight * 0.45));
  }

  function nudge(sc, y) {
    sc.scrollTop = y;
    sc.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  // 虚拟列表不会在改 scrollTop 的同一帧换气泡，等到文本变了或超时再采样。
  function waitForWindow(previousKey, timeout, shouldAbort) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (shouldAbort && shouldAbort()) {
          resolve(visibleTexts().join('\n'));
          return;
        }
        const now = visibleTexts().join('\n');
        const elapsed = Date.now() - start;
        if ((previousKey && now !== previousKey && elapsed >= 40) || elapsed >= timeout) resolve(now);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function noteUserInterrupt() {
    userInterruptGen++;
  }

  function bindUserInterrupt(sc) {
    if (!sc || sc._dwtNavInterruptBound) return;
    sc._dwtNavInterruptBound = true;
    const opts = { passive: true, capture: true };
    sc.addEventListener('wheel', noteUserInterrupt, opts);
    sc.addEventListener('touchstart', noteUserInterrupt, opts);
    sc.addEventListener('pointerdown', noteUserInterrupt, opts);
  }

  // 从 React fiber / props 里尽量抽出用户提问，避免为虚拟列表强制滚扫。
  // 启发式：带 role/user 标记的消息，或 content/text 字段；深度与条数有硬上限。
  function tryHarvestFromFiber(sc) {
    if (!sc) return [];
    const fiberKey = Object.keys(sc).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fiberKey) return [];
    const out = [];
    const seen = new Set();
    const pushText = (raw) => {
      if (typeof raw !== 'string') return;
      const t = normalizeNavText(raw);
      if (!isEligibleNavText(t) || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    const looksUser = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      const role = obj.role || obj.author || obj.sender || obj.from || obj.type || obj.message_type;
      if (role == null) return false;
      const s = String(role).toLowerCase();
      // 先拒助手/系统，避免 type 含 user 子串（如 assistant_to_user）误入
      if (s.indexOf('assistant') >= 0 || s.indexOf('bot') >= 0 || s.indexOf('system') >= 0
        || s === 'ai' || s.indexOf('model') >= 0) return false;
      return s === 'user' || s === 'human' || s === 'self' || s === '1'
        || s === 'user_message' || s === 'human_message'
        || /(^|_)user($|_)/.test(s) || /(^|_)human($|_)/.test(s);
    };
    const takeFromMsg = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (!looksUser(obj)) return;
      const c = obj.content ?? obj.text ?? obj.message ?? obj.prompt ?? obj.query;
      if (typeof c === 'string') pushText(c);
      else if (Array.isArray(c)) {
        c.forEach((part) => {
          if (typeof part === 'string') pushText(part);
          else if (part && typeof part.text === 'string') pushText(part.text);
          else if (part && typeof part.content === 'string') pushText(part.content);
        });
      } else if (c && typeof c === 'object' && typeof c.text === 'string') pushText(c.text);
    };
    const scanArray = (arr, depth) => {
      if (!Array.isArray(arr) || depth > 4 || out.length > 200) return;
      if (arr.length < 2 || arr.length > 500) return;
      for (let i = 0; i < arr.length && out.length <= 200; i++) {
        const item = arr[i];
        if (typeof item === 'string') continue;
        takeFromMsg(item);
        if (item && typeof item === 'object') {
          if (item.message) takeFromMsg(item.message);
          if (item.data) takeFromMsg(item.data);
        }
      }
    };
    const visitProps = (props, depth) => {
      if (!props || depth > 3 || out.length > 200) return;
      for (const key of Object.keys(props)) {
        if (key === 'children' || key === 'ref' || key.startsWith('__')) continue;
        const val = props[key];
        if (Array.isArray(val)) scanArray(val, depth + 1);
        else if (val && typeof val === 'object' && Array.isArray(val.list)) scanArray(val.list, depth + 1);
        else if (val && typeof val === 'object' && Array.isArray(val.messages)) scanArray(val.messages, depth + 1);
        else if (val && typeof val === 'object' && Array.isArray(val.items)) scanArray(val.items, depth + 1);
      }
    };
    let fiber = sc[fiberKey];
    let walked = 0;
    // 先沿 return 链找列表数据（虚拟 scroller 的父级常挂 dataSource）
    for (let i = 0; fiber && i < 12; i++) {
      visitProps(fiber.memoizedProps || fiber.pendingProps, 0);
      fiber = fiber.return;
      walked++;
      if (out.length >= 3) break;
    }
    // 不够再浅扫 child 子树
    if (out.length < 3) {
      fiber = sc[fiberKey];
      const stack = fiber ? [fiber.child] : [];
      while (stack.length && walked < 80 && out.length < 200) {
        const f = stack.pop();
        if (!f) continue;
        walked++;
        visitProps(f.memoizedProps || f.pendingProps, 0);
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    return out;
  }

  async function jumpTo(text, listIndex) {
    noteUserInterrupt(); // 用户主动跳转：停掉后台软扫，避免抢滚
    const pref = (typeof listIndex === 'number' && listIndex >= 0) ? listIndex : -1;
    let node = findBubble(text, pref);
    const sc = getScroller();
    // 虚拟列表未挂载目标时：先按 nav 比例预滚，再索引+文案定位（短键尤甚）
    if (!node && sc && pref >= 0 && navList.length > 1) {
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      const y = Math.round((pref / Math.max(1, navList.length - 1)) * max);
      nudge(sc, y);
      await waitForWindow('', 320);
      node = findBubble(text, pref);
    }
    if (!node && sc) {
      const step = stepSize(sc);
      let y = 0;
      let guard = 0;
      let lastH = -1;
      let stuck = 0;
      let prev = '';
      while (!node && guard++ < 160) {
        nudge(sc, y);
        prev = await waitForWindow(prev, 280);
        node = findBubble(text, pref);
        if (node) break;
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        if (y >= max - 2) {
          if (sc.scrollHeight === lastH) stuck++;
          else stuck = 0;
          lastH = sc.scrollHeight;
          if (stuck >= 2) break;
          y = 0;
        } else {
          lastH = sc.scrollHeight;
          y = Math.min(max, y + step);
        }
      }
    }
    let jumpOk = false;
    if (node) {
      highlight(node, sc);
      // 虚拟列表换窗后 layout 需短延迟；双 rAF 仍会假阴性
      await new Promise((r) => setTimeout(r, 160));
      let again = findBubble(text, pref) || node;
      jumpOk = isBubbleInView(again, sc);
      if (!jumpOk && again) {
        scrollNodeIntoScroller(again, sc);
        await waitForWindow('', 280);
        again = findBubble(text, pref) || again;
        scrollNodeIntoScroller(again, sc);
        await new Promise((r) => setTimeout(r, 120));
        again = findBubble(text, pref) || again;
        jumpOk = isBubbleInView(again, sc);
      }
    }
    try {
      postNavBeacon({
        reason: 'nav-jump',
        jumpOk: !!jumpOk,
        jumpText: resolveNavJumpKey(text),
        jumpIndex: pref,
      });
    } catch (e3) { /* ignore */ }
    return !!jumpOk;
  }

  function getChatId() {
    const m = String(location.pathname || '').match(/\/chat\/(\d+)/);
    return m ? m[1] : '';
  }

  function applyScanResult(texts) {
    // 扫描失败/中断时至少展示当前视口已有气泡，避免导航永久空白
    let merged = texts && texts.length ? texts.slice() : [];
    // DOM 视口为可信源：用 mergeTexts 叠窗；最终保序去重 + 拒探针
    merged = mergeTexts(merged, visibleTexts());
    merged = dedupePreserveOrder(merged.filter(isEligibleNavText));
    // 同会话拒绝被短结果覆盖（防 Fiber/视口 与全表振荡）
    if (navList.length && merged.length < navList.length) {
      merged = dedupePreserveOrder(mergeTexts(navList.map((item) => item.text), merged).filter(isEligibleNavText));
    }
    navList = merged.map((text) => ({ text }));
    if (!document.getElementById(PANEL_ID)) mount();
    else { renderItems(); markCurrent(); }
  }

  // 主入口：只用 DOM(+Fiber) 填表，绝不自动改 scrollTop。
  // 虚拟列表未挂载的更早提问：等用户自然滚动，由 onScrollMark / MutationObserver 合并。
  function postNavBeacon(extra) {
    // 验收灯塔只服务 dev 链路（5179/5181 本地页）。真机上 127.0.0.1 无人监听，
    // 发了只会刷 ERR_CONNECTION_REFUSED 噪声，故非本机页面直接短路。
    if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return;
    try {
      const labelsEl = document.getElementById(GUTTER_LABELS_ID);
      const tipEl = document.getElementById(GUTTER_TIP_ID);
      const rows = labelsEl ? labelsEl.querySelectorAll('.dwt-gl-row') : [];
      let labelSample = '';
      try {
        const t0 = rows[0] && rows[0].querySelector('.dwt-gl-text');
        labelSample = String((t0 && t0.textContent) || (rows[0] && rows[0].textContent) || '').trim().slice(0, 40);
      } catch (e0) { /* ignore */ }
      const bubblesNow = visibleTexts();
      let matchN = 0;
      const labelTexts = [];
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const dt = row.getAttribute && row.getAttribute('data-text');
        const te = row.querySelector && row.querySelector('.dwt-gl-text');
        const lt = normalizeNavText(dt || (te && te.textContent) || '');
        if (lt) labelTexts.push(lt);
      }
      const navTextsNow = (navList.length
        ? navList.map((item) => normalizeNavText(item && item.text))
        : labelTexts.slice()).filter(isEligibleNavText);
      const alignReport = buildNavAlignReport(bubblesNow, navTextsNow, {
        labelTexts: labelTexts,
      });
      const cmpN = Math.min(bubblesNow.length, labelTexts.length);
      for (let ci = 0; ci < cmpN; ci++) {
        if (bubblesNow[ci] === labelTexts[ci]) matchN++;
      }
      const body = JSON.stringify(Object.assign({
        href: String(location.href || ''),
        nav: !!document.getElementById(PANEL_ID),
        navRev: NAV_REV,
        navMode: gutterActive() ? 'gutter-css' : 'panel',
        gutterMode: !!gutterMode,
        autoScrollSweep: false,
        navCount: navList.length,
        // 空会话收壳是有意行为：与「面板没挂上」区分开，验收别把空态判成失败
        navEmpty: !navList.length,
        navEmptyHidden: !!navEmptyHidden,
        labelsRows: rows.length,
        labelSample: labelSample,
        tipShow: !!(tipEl && tipEl.classList.contains('dwt-show')),
        tipText: tipEl ? String(tipEl.textContent || '').trim().slice(0, 60) : '',
        bubbleCount: bubblesNow.length,
        matchMounted: matchN,
        matchAllMounted: cmpN > 0 && matchN === cmpN && !labelTexts.some(isProbeText),
        // align payload（serve 另落 .last-nav-align.json）
        bubbles: alignReport.bubbles,
        navTexts: alignReport.navTexts,
        aligned: alignReport.aligned,
        mismatch: alignReport.mismatch,
        allAligned: alignReport.allAligned,
        probeFiltered: alignReport.probeFiltered,
        alignRev: 33,
        reason: 'navigator-loadAll',
        t: Date.now(),
      }, extra || {}));
      const urls = [
        'http://127.0.0.1:5181/dev/bridge/verify',
        'http://127.0.0.1:5179/dev/bridge/verify',
        'http://127.0.0.1:5179/dev/nav-align',
        'http://127.0.0.1:5181/dev/nav-align',
      ];
      urls.forEach((u) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            navigator.sendBeacon(u, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
          }
          fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, mode: 'cors', keepalive: true }).catch(() => {});
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

  async function loadAll() {
    const gen = ++scanGen;
    const chatAtStart = getChatId();
    activeChatId = chatAtStart || activeChatId;

    try { dwt.selectorManager?.invalidate?.(); } catch (e) { /* 无 selectorManager 时忽略 */ }
    const sc = getScroller();
    if (sc) bindUserInterrupt(sc);

    // DOM 气泡为真相源；Fiber 仅对齐扩展；刻度 title 仅 DOM+Fiber 皆空时兜底
    let texts = visibleTexts();
    const fiberTexts = tryHarvestFromFiber(sc);
    let tickTitles = [];
    if (fiberTexts.length) {
      texts = alignFiberToDom(fiberTexts, texts);
    }
    if (!texts.length) {
      tickTitles = harvestGutterTickTitles();
      if (tickTitles.length) texts = dedupePreserveOrder(tickTitles);
    }

    if (gen !== scanGen) return;
    scanning = false;
    applyScanResult(texts);
    lastFullScanChatId = chatAtStart;
    lastFullScanAt = Date.now();
    renderItems();
    postNavBeacon({
      fiberCount: fiberTexts.length,
      tickTitleCount: tickTitles.length,
      reason: 'navigator-loadAll',
    });
  }

  // 豆包 SPA：点左侧其他会话只改 URL/DOM，不整页刷新。必须重扫导航。
  function onChatSwitch(nextId) {
    if (nextId && nextId === activeChatId) return;
    activeChatId = nextId || '';
    scanGen++;
    scanning = false;
    keyword = '';
    navList = [];
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const search = panel.querySelector('#dwt-nav-search');
      if (search) search.value = '';
      renderItems();
    }
    // 等新会话气泡挂上再被动采集（绝不强制顶→底滚）
    setTimeout(() => {
      if (getChatId() !== activeChatId) return;
      loadAll();
    }, 450);
  }

  function watchRouteChange() {
    activeChatId = getChatId();
    let lastHref = location.href;
    const check = () => {
      if (!isActiveNav()) return;
      if (location.href === lastHref) return;
      lastHref = location.href;
      onChatSwitch(getChatId());
    };
    if (routeTimer) clearInterval(routeTimer);
    routeCheckFn = check;
    routeTimer = setInterval(check, 500);
    window.addEventListener('popstate', check);
    const wrap = (fn) => function () {
      const ret = fn.apply(this, arguments);
      setTimeout(check, 0);
      return ret;
    };
    try {
      history.pushState = wrap(history.pushState.bind(history));
      history.replaceState = wrap(history.replaceState.bind(history));
    } catch (e) { /* 部分环境不可改写 history */ }
  }

  function mount() {
    // 热更新后旧闭包的 observer 仍可能回调 mount：若已被新 revision 接管则不再建面板
    if (dwt.navigatorModule && dwt.navigatorModule.mount !== mount) return;
    if (!navList.length) navList = visibleTexts().map((text) => ({ text }));
    // 空列表也保留 #dwt-nav 壳（显示「暂无提问」），避免 live-boot 验收永远等不到节点；
    // 有气泡后再 renderItems 填入。
    injectStyles();
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const nav = document.createElement('div');
    nav.id = PANEL_ID;
    // 双保险: inline style 保证面板可见 (即使 injectStyles 因故没跑),
    // CSS class (.dwt-nav-dark) 负责深色切换
    // z-index below Doubao native popovers/menus (often ~1000+) so they are not covered
    nav.style.cssText = 'position:fixed;right:12px;top:84px;z-index:200;width:200px;'
      + 'max-height:60vh;'
      + 'display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;'
      + 'visibility:visible;opacity:1;pointer-events:auto;'
      + 'background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);'
      + 'border:1px solid rgba(0,0,0,0.06);border-radius:12px;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);'
      + 'padding:8px;transition:max-height .25s ease, opacity .2s ease;';
    if (collapsed) nav.classList.add('dwt-nav-collapsed');
    if (fitAll) nav.classList.add('dwt-nav-fitall');

    nav.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">'
      + '<div id="dwt-nav-title" style="font-size:13px;font-weight:600;color:#1f2328;letter-spacing:.2px;">\u{1F4CC} 导航</div>'
      + '<span id="dwt-nav-collapse" style="cursor:pointer;font-size:14px;color:#8b949e;'
      + 'padding:2px 6px;border-radius:4px;" '
      + 'onmouseover="this.style.background=\'#f0f2f5\'" onmouseout="this.style.background=\'transparent\'">'
      + (collapsed ? '\u25B6' : '\u25C0') + '</span>'
      + '</div>'
      + '<div class="dwt-nav-body" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden;">'
      + '<input id="dwt-nav-search" type="text" placeholder="\u{1F50D} 搜索提问…" '
      + 'style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:6px 10px;border:1px solid #d0d7de;'
      + 'border-radius:8px;font-size:12px;color:#1f2328;background:#fff;outline:none;flex-shrink:0;'
      + 'transition:border-color .15s, box-shadow .15s;"'
      + 'onfocus="this.style.borderColor=\'#2d72de\';this.style.boxShadow=\'0 0 0 3px rgba(45,114,222,.15)\'"'
      + 'onblur="this.style.borderColor=\'#d0d7de\';this.style.boxShadow=\'none\'">'
      + '<div class="dwt-nav-rows" style="overflow-y:auto;overflow-x:hidden;flex:1 1 auto;min-height:0;"></div>'
      + '</div>'
      + '<div class="dwt-nav-footer" title="点击切换：铺开全部 / 收起高度" style="padding-top:6px;margin-top:6px;border-top:1px solid #f0f2f5;'
      + 'font-size:10px;color:#8b949e;text-align:center;flex-shrink:0;cursor:pointer;"></div>';

    const host = document.body || document.documentElement;
    if (!host) return;
    host.appendChild(nav);
    // 标题右侧 ⓘ：悬停出表格化说明（面板重建会清掉 nav.innerHTML，这里跟着重挂；attach 幂等）
    window.dwt?.helpTip?.attach?.(nav.querySelector('#dwt-nav-title'), HELP);
    hookThemeChanges();
    applyDark();
    applyFitAll();

    const collapse = nav.querySelector('#dwt-nav-collapse');
    collapse.addEventListener('click', () => {
      collapsed = !collapsed;
      nav.classList.toggle('dwt-nav-collapsed', collapsed);
      collapse.textContent = collapsed ? '\u25B6' : '\u25C0';
      if (!collapsed) applyFitAll();
    });

    const search = nav.querySelector('#dwt-nav-search');
    search.value = keyword;
    search.addEventListener('input', (e) => { keyword = e.target.value; renderItems(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());

    // 页脚切换与行跳转共用面板委托，避免 footer 节点被改写后丢监听；
    // stopPropagation 减少宿主页全局 click 抢事件
    nav.addEventListener('click', (e) => {
      if (e.target.closest('.dwt-nav-footer')) {
        e.stopPropagation();
        toggleFitAll();
        return;
      }
      const el = e.target.closest('[data-idx]');
      if (!el) return;
      e.stopPropagation();
      const idx = Number(el.dataset.idx);
      const item = navList[idx];
      if (item && item.text) jumpTo(item.text, idx);
    });

    renderItems();
    // 若已进入原生 gutter 挪右态，立刻藏面板（防止 mount 的 inline flex 闪一下）
    if (USE_NATIVE_GUTTER_CSS && document.documentElement.classList.contains('dwt-native-gutter')) {
      hideCustomPanel();
    } else {
      markCurrent();
    }
  }

  // 必须先声明。document_idle 时 readyState 已不是 loading，会立刻调用 startLiveWatch。
  let liveObserver = null;
  let refreshTimer = null;
  let markTimer = null;
  // gutter labels：破反馈环 / 防闪烁
  let gutterProgScroll = false;
  let gutterLabelsSig = '';
  let gutterLabelsCurIdx = -1;
  let gutterHighlightRaf = 0;
  let heartbeatTimer = null;
  let routeTimer = null;
  let routeCheckFn = null;

  function isActiveNav() {
    return !!(dwt.navigatorModule && dwt.navigatorModule.markCurrent === markCurrent);
  }

  function onScrollMark(ev) {
    // 程序化 scrollIntoView / 主区桥接滚动期间勿再 sync，避免反馈环
    if (gutterProgScroll) return;
    // labels 列表自身滚动不驱动主区高亮重算（解耦）
    try {
      const t = ev && ev.target;
      if (t && t.closest && t.closest('#' + GUTTER_LABELS_ID)) return;
    } catch (eIgnore) { /* ignore */ }
    if (markTimer) clearTimeout(markTimer);
    markTimer = setTimeout(() => {
      if (gutterProgScroll) return;
      // 自然滚动时顺带合并视口气泡（虚拟列表换窗主要靠这个补齐）
      if (!scanning) mergeVisibleIntoList();
      markCurrent();
    }, 180);
  }

  // 把当前挂载的用户气泡并入 navList（不改 scrollTop）
  function mergeVisibleIntoList() {
    const visible = visibleTexts();
    if (!visible.length) return false;
    const oldTexts = navList.map((item) => item.text);
    if (oldTexts.length && visible.filter((t) => oldTexts.indexOf(t) >= 0).length === 0) {
      // 与旧列表无交集：多半换会话，交给 refreshList / onChatSwitch
      return false;
    }
    const merged = dedupePreserveOrder(mergeTexts(oldTexts, visible).filter(isEligibleNavText));
    const changed = merged.length !== navList.length
      || merged.some((text, i) => navList[i]?.text !== text);
    if (!changed) return false;
    navList = merged.map((text) => ({ text }));
    const panel = document.getElementById(PANEL_ID);
    if (!panel) mount();
    else { renderItems(); applyDark(); }
    return true;
  }

  function findNativeGutter() {
    return document.querySelector(SEL_GUTTER_ASIDE) || document.querySelector(SEL_GUTTER_TICKS);
  }

  function findTickColumn() {
    return document.querySelector(SEL_GUTTER_TICKS);
  }

  function injectGutterBeautifyCss() {
    let st = document.getElementById(GUTTER_STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = GUTTER_STYLE_ID;
      (document.head || document.documentElement).appendChild(st);
    }
    // rev37: 原生轨道 = 内置导航列表本体（列表挂进 aside，200px 毛玻璃卡片随内容自适应）
    //   ① 绝不再覆盖原生刻度列的内联 padding-top/bottom（曾把刻度压到栏顶 → 用户报「内置导航栏出问题」）
    //   ② 刻度内容整条隐藏，列表挂进 aside（#dwt-gutter-labels 不再是独立浮层）
    //   ③ 配色走 --dwt-* 变量：跟随豆包外观（深/浅）自动翻转，无需 JS 平行配色
    //   ④ aside 的定位模型保持豆包原样（top/bottom 拉满）：实测把 bottom 改 auto 会让豆包
    //      自己把轨道内容 inline 隐藏（高度塌成 0），所以卡片外观挂在列表上、栏本体保持透明
    st.textContent = `
      html.dwt-native-gutter aside[class*="gutter"] {
        position: fixed !important;
        left: auto !important;
        right: 12px !important;
        top: 84px !important;
        bottom: 16px !important;
        z-index: 180 !important;
        margin: 0 !important;
        width: 200px !important;
        min-width: 200px !important;
        max-width: 200px !important;
        box-sizing: border-box !important;
        padding: 0 !important;
        overflow: visible !important;
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        /* 卡片以下的空档必须点透，别挡住对话正文 */
        pointer-events: none !important;
        touch-action: pan-y !important;
      }
      /* 豆包原生刻度内容（外层 w-316 容器 + 刻度列）整条隐藏：位置由内置列表接管。
         红线 1：别再给刻度列写 padding !important —— 那正是 rev19–36 刻度挤在栏顶的根因。
         红线 2：:not(#dwt-gutter-labels) 不能省 —— 列表卡片也是 aside 的直接 div 子节点，
         一刀切 [> div] 会把自家卡片一起 display:none（rev38 真机就是这么白屏的）。 */
      html.dwt-native-gutter aside[class*="gutter"] > div:not(#dwt-gutter-labels),
      html.dwt-native-gutter aside[class*="gutter"] [class*="w-34"] {
        display: none !important;
      }
      /* 导航列表：卡片本体（宽 200）；限高留给底栏输入区 / 🧰，超出在 .dwt-gl-rows 内滚 */
      #dwt-gutter-labels {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        max-height: 400px;
        z-index: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
        padding: 8px;
        border-radius: 12px;
        background: var(--dwt-bg, rgba(255,255,255,0.96));
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        border: 1px solid var(--dwt-border, rgba(0,0,0,0.06));
        box-shadow: 0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: var(--dwt-fg, #1f2328);
      }
      #dwt-gutter-labels .dwt-gl-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 8px; flex-shrink: 0;
        font-size: 13px; font-weight: 600; color: var(--dwt-fg, #1f2328); letter-spacing: .2px;
      }
      #dwt-gutter-labels .dwt-gl-rows {
        flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto;
        overscroll-behavior: contain;
      }
      #dwt-gutter-labels .dwt-gl-rows::-webkit-scrollbar { width: 4px; }
      #dwt-gutter-labels .dwt-gl-rows::-webkit-scrollbar-thumb { background: var(--dwt-border, #d0d7de); border-radius: 2px; }
      #dwt-gutter-labels .dwt-gl-rows::-webkit-scrollbar-track { background: transparent; }
      #dwt-gutter-labels .dwt-gl-row {
        display: flex; align-items: center; gap: 5px;
        padding: 3px 5px; border-radius: 5px; cursor: pointer;
        transition: background .12s ease;
      }
      #dwt-gutter-labels .dwt-gl-row:hover { background: var(--dwt-hover, #f0f4ff); }
      #dwt-gutter-labels .dwt-gl-row.dwt-gl-current {
        background: var(--dwt-hover, #e8f0ff); color: var(--dwt-accent, #2d72de);
        box-shadow: inset 3px 0 0 var(--dwt-accent, #2d72de);
      }
      #dwt-gutter-labels .dwt-gl-num {
        flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 600;
        background: var(--dwt-soft, #f0f2f5); color: var(--dwt-muted, #656d76);
        transition: background .12s;
      }
      #dwt-gutter-labels .dwt-gl-row:hover .dwt-gl-num { background: var(--dwt-hover, #dde7ff); color: var(--dwt-accent, #2d72de); }
      #dwt-gutter-labels .dwt-gl-row.dwt-gl-current .dwt-gl-num {
        background: var(--dwt-hover, #dde7ff); color: var(--dwt-accent, #2d72de);
      }
      #dwt-gutter-labels .dwt-gl-text {
        flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: var(--dwt-fg, #1f2328); font-size: 12px; line-height: 1.4;
      }
      #dwt-gutter-labels .dwt-gl-row.dwt-gl-current .dwt-gl-text {
        color: var(--dwt-accent, #1a56db); font-weight: 500;
      }
      #dwt-gutter-labels .dwt-gl-foot {
        flex-shrink: 0; margin-top: 6px; padding-top: 6px;
        border-top: 1px solid var(--dwt-border, #f0f2f5); font-size: 10px;
        color: var(--dwt-muted, #8b949e);
        text-align: center; cursor: default; user-select: none;
      }
      /* 深色：--dwt-accent 只有浅色档，深底上 #2d72de 压不住 —— 与面板 .dwt-nav-dark 同一套蓝，
         就地覆盖（不动 common.css 的共享变量，免得牵连 prompt-bar / selection-tools 等）。 */
      html.dwt-ui-dark #dwt-gutter-labels .dwt-gl-row.dwt-gl-current { box-shadow: inset 3px 0 0 #4d8bf5; }
      html.dwt-ui-dark #dwt-gutter-labels .dwt-gl-row.dwt-gl-current,
      html.dwt-ui-dark #dwt-gutter-labels .dwt-gl-row:hover { color: #4d8bf5; }
      html.dwt-ui-dark #dwt-gutter-labels .dwt-gl-row.dwt-gl-current .dwt-gl-text { color: #7fb0ff; }
      html.dwt-ui-dark #dwt-gutter-labels .dwt-gl-row.dwt-gl-current .dwt-gl-num,
      html.dwt-ui-dark #dwt-gutter-labels .dwt-gl-row:hover .dwt-gl-num { color: #4d8bf5; }
      /* tip：浅色毛玻璃气泡（挂在列表行左侧；同样走 --dwt-* 变量） */
      #dwt-gutter-tip {
        position: fixed; z-index: 190; max-width: 200px;
        padding: 6px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4;
        color: var(--dwt-fg, #1f2328); background: var(--dwt-bg, rgba(255,255,255,0.98));
        backdrop-filter: blur(8px);
        border: 1px solid var(--dwt-border, rgba(0,0,0,0.08));
        box-shadow: 0 8px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
        pointer-events: none; opacity: 0; transition: opacity .12s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #dwt-gutter-tip.dwt-show { opacity: 1; }
      #dwt-gutter-count { display: none !important; }
      html.dwt-native-gutter #dwt-nav {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    `;
  }

  // rev37 不变量：原生轨道就是内置导航列表本体 —— 栏必须在右半侧、宽度接近 200px、整条拉满，
  // 且 #dwt-gutter-labels 确实挂在栏内。塌宽 / 列表被宿主 React 摘走都判失败（交 streak 回退面板）。
  function isGutterVisuallyOk() {
    const gut = document.querySelector(SEL_GUTTER_ASIDE);
    if (!gut) return false;
    const r = gut.getBoundingClientRect();
    if (r.width < 120 || r.height < 120) return false;
    if (r.left < window.innerWidth * 0.5) return false;
    if (r.top > window.innerHeight - 60 || r.bottom < 60) return false;
    const labels = document.getElementById(GUTTER_LABELS_ID);
    if (!labels || !gut.contains(labels)) return false;
    return true;
  }

  /** position:fixed 的 offsetParent 恒为 null，用矩形判断面板是否在视口内 */
  function isPanelVisuallyOk() {
    const nav = document.getElementById(PANEL_ID);
    if (!nav) return false;
    const cs = window.getComputedStyle ? getComputedStyle(nav) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)) {
      return false;
    }
    const r = nav.getBoundingClientRect();
    if (r.width < 80 || r.height < 40) return false;
    if (r.bottom < 20 || r.top > window.innerHeight - 20) return false;
    if (r.right < 20 || r.left > window.innerWidth - 20) return false;
    return true;
  }

  function hideCustomPanel() {
    document.documentElement.classList.add('dwt-gutter-ok');
    const nav = document.getElementById(PANEL_ID);
    if (!nav) return;
    nav.style.setProperty('display', 'none', 'important');
    nav.style.setProperty('visibility', 'hidden', 'important');
    nav.style.setProperty('pointer-events', 'none', 'important');
    nav.style.setProperty('opacity', '0', 'important');
  }

  // 空会话（没有可跳转的提问）时右侧不该杵着「暂无提问」空卡：
  // 只 display:none，节点必须留在 DOM —— live-boot / inject.js 的验收按「#dwt-nav 存在」判定 UI 就位。
  let navEmptyHidden = false;

  function forcePanelVisible() {
    // gutter 模式锁定：绝不把自定义面板拉回来（双栏闪烁根因）
    if (gutterMode || document.documentElement.classList.contains('dwt-native-gutter')) {
      hideCustomPanel();
      return;
    }
    document.documentElement.classList.remove('dwt-gutter-ok');
    const nav = document.getElementById(PANEL_ID);
    if (!nav) return;
    nav.style.removeProperty('display');
    nav.style.removeProperty('visibility');
    nav.style.removeProperty('pointer-events');
    nav.style.removeProperty('opacity');
    nav.style.visibility = 'visible';
    nav.style.opacity = '1';
    nav.style.pointerEvents = 'auto';
    nav.style.zIndex = '200';
    if (!nav.style.position) nav.style.position = 'fixed';
    if (!navList.length) {
      navEmptyHidden = true;
      nav.style.setProperty('display', 'none', 'important');
      return;
    }
    navEmptyHidden = false;
    nav.style.display = 'flex';
  }

  // 列表增删后同步空态显隐（gutter 态由 hideCustomPanel 全权处理，这里不插手）
  function syncEmptyVisibility() {
    if (gutterMode || document.documentElement.classList.contains('dwt-native-gutter')) return;
    if (navEmptyHidden === !navList.length) return;
    forcePanelVisible();
  }

  function syncGutterCountBadge() {
    // rev19: 计数并入关键字轨页脚，不再单独徽章
    syncGutterLabels();
  }

  function ensureGutterTipEl() {
    let tip = document.getElementById(GUTTER_TIP_ID);
    if (!tip) {
      tip = document.createElement('div');
      tip.id = GUTTER_TIP_ID;
      (document.body || document.documentElement).appendChild(tip);
    }
    return tip;
  }

  function showGutterTip(text, anchorEl) {
    const tip = ensureGutterTipEl();
    const t = (text || '').trim();
    if (!t) { tip.classList.remove('dwt-show'); return; }
    tip.textContent = t;
    const gut = findNativeGutter();
    const ar = (anchorEl || gut)?.getBoundingClientRect?.();
    if (!ar) return;
    // 气泡贴在锚点左侧（关键字行或刻度），与自定义栏同 top 起点
    const tw = 200;
    tip.style.right = Math.max(56, window.innerWidth - ar.left + 8) + 'px';
    tip.style.left = 'auto';
    tip.style.top = Math.max(84, Math.min(window.innerHeight - 80, ar.top + ar.height / 2 - 14)) + 'px';
    tip.style.maxWidth = tw + 'px';
    tip.classList.add('dwt-show');
  }

  function hideGutterTip() {
    document.getElementById(GUTTER_TIP_ID)?.classList.remove('dwt-show');
  }

  function gutterNavListSig() {
    return navList.map((item) => normalizeNavText(item && item.text)).join('\n');
  }

  function highlightGutterLabelRows(rowsEl, cur, skipScroll) {
    if (!rowsEl) return;
    const kids = rowsEl.querySelectorAll('.dwt-gl-row[data-idx]');
    kids.forEach((row) => {
      const on = cur >= 0 && Number(row.dataset.idx) === cur;
      row.classList.toggle('dwt-gl-current', on);
    });
    const idxChanged = cur !== gutterLabelsCurIdx;
    gutterLabelsCurIdx = cur;
    // 仅当前项变化时被动跟随（对齐原 #dwt-nav）；滑动帧内 skipScroll 避免抖动
    if (!skipScroll && idxChanged && cur >= 0) {
      const row = rowsEl.querySelector('.dwt-gl-row[data-idx="' + cur + '"]');
      if (row) {
        gutterProgScroll = true;
        try { row.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { gutterProgScroll = false; });
        });
      }
    }
  }

  function scheduleGutterHighlight(opts) {
    const o = opts || {};
    if (gutterHighlightRaf) cancelAnimationFrame(gutterHighlightRaf);
    gutterHighlightRaf = requestAnimationFrame(() => {
      gutterHighlightRaf = 0;
      try { syncGutterLabels(o); } catch (e) { /* ignore */ }
    });
  }

  function syncGutterLabels(opts) {
    if (!isActiveNav()) return;
    const skipScroll = !!(opts && opts.skipScroll);
    const forceRebuild = !!(opts && opts.forceRebuild);
    if (!gutterMode && !document.documentElement.classList.contains('dwt-native-gutter')) {
      document.getElementById(GUTTER_LABELS_ID)?.remove();
      hideGutterTip();
      gutterLabelsSig = '';
      gutterLabelsCurIdx = -1;
      return;
    }
    if (!navList.length) {
      // 尽量被动补齐一次
      try { mergeVisibleIntoList(); } catch (e) { /* ignore */ }
    }
    // rev37: 列表是「内置导航栏」的内容 —— 必须挂在原生 aside 内，不再是独立浮层
    const railHost = document.querySelector(SEL_GUTTER_ASIDE);
    if (!railHost) {
      // 轨道不在（换会话瞬时 / 该会话没有轨道）→ 收起列表，由 ensureNavAlive 的 streak 回退面板
      document.getElementById(GUTTER_LABELS_ID)?.remove();
      gutterLabelsSig = '';
      gutterLabelsCurIdx = -1;
      return;
    }
    let box = document.getElementById(GUTTER_LABELS_ID);
    if (box && box.parentElement !== railHost) {
      // 宿主 React 重渲染会摘掉外来子节点：原样搬回（不重建，避免整表闪烁）
      try { railHost.appendChild(box); } catch (eMove) { /* ignore */ }
    }
    if (!box) {
      box = document.createElement('div');
      box.id = GUTTER_LABELS_ID;
      box.innerHTML =
        '<div class="dwt-gl-head"><span>\u{1F4CC} 导航</span></div>'
        + '<div class="dwt-gl-rows"></div>'
        + '<div class="dwt-gl-foot"></div>';
      railHost.appendChild(box);
      box.addEventListener('click', (e) => {
        const row = e.target.closest('[data-idx]');
        if (!row) return;
        e.stopPropagation();
        const idx = Number(row.dataset.idx);
        const item = navList[idx];
        if (item && item.text) jumpTo(item.text, idx);
      });
      // 单向：labels 滚轮只驱动主对话；高亮由主区 scroll 被动跟随（勿同步 markCurrent）
      box.addEventListener('wheel', (e) => {
        const sc = getScroller();
        if (!sc) return;
        e.preventDefault();
        e.stopPropagation();
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        if (max <= 0) return;
        const next = Math.min(max, Math.max(0, sc.scrollTop + e.deltaY));
        if (next !== sc.scrollTop) sc.scrollTop = next;
        // rAF 合并高亮：只切 class，滑动中不 scrollIntoView
        scheduleGutterHighlight({ skipScroll: true });
        if (markTimer) clearTimeout(markTimer);
        markTimer = setTimeout(() => {
          try { markCurrent(); } catch (errM) { /* ignore */ }
        }, 140);
      }, { passive: false });
      box.addEventListener('mouseover', (e) => {
        const row = e.target.closest('[data-idx]');
        if (!row) return;
        const idx = Number(row.dataset.idx);
        const item = navList[idx];
        if (item) showGutterTip(item.text, row);
      });
      box.addEventListener('mouseleave', () => hideGutterTip());
      gutterLabelsSig = '';
      gutterLabelsCurIdx = -1;
    }
    // 空会话：整卡收起（原生刻度已被本模块 display:none，留一块「暂无提问」空卡同样是噪音）。
    // 只改 display，不动 aside 尺寸 —— isGutterVisuallyOk 的量尺不受影响。
    const wantEmpty = !navList.length;
    if ((box.dataset.dwtEmpty === '1') !== wantEmpty) {
      if (wantEmpty) {
        box.dataset.dwtEmpty = '1';
        box.style.setProperty('display', 'none', 'important');
      } else {
        delete box.dataset.dwtEmpty;
        box.style.removeProperty('display');
      }
    }
    const head = box.querySelector('.dwt-gl-head');
    if (head && /原生/.test(head.textContent || '')) {
      head.innerHTML = '<span>\u{1F4CC} 导航</span>';
      delete head.dataset.dwtHelp; // 标题刚被重建 → 图标也没了，标记作废
    }
    // 标题右侧 ⓘ：悬停出表格化说明。这是每次 sync 都会走的热路径，
    // 所以只读一个 dataset 标记，标记在就完全不碰 DOM。
    if (head && !head.dataset.dwtHelp) {
      const hb = window.dwt?.helpTip?.attach?.(head.querySelector('span'), HELP);
      if (hb) head.dataset.dwtHelp = '1';
    }
    const rows = box.querySelector('.dwt-gl-rows');
    const foot = box.querySelector('.dwt-gl-foot');
    const sig = gutterNavListSig();
    const oldRowN = rows ? rows.querySelectorAll('.dwt-gl-row[data-idx]').length : 0;
    // 同会话缩表（振荡子集）时只切高亮，勿 innerHTML 闪烁
    if (!forceRebuild && oldRowN > 0 && navList.length > 0 && navList.length < oldRowN
      && sig !== gutterLabelsSig) {
      highlightGutterLabelRows(rows, findCurrentNavIndex(), true);
      if (foot) {
        const ft = '共 ' + Math.max(oldRowN, navList.length) + ' 条';
        if (foot.textContent !== ft) foot.textContent = ft;
      }
      return;
    }
    const needRebuild = forceRebuild || sig !== gutterLabelsSig
      || !rows || !rows.querySelector('.dwt-gl-row[data-idx]');
    if (needRebuild) {
      // 节流整表重绘：滑动中高频 sync 只切 class，避免闪烁
      const nowR = Date.now();
      if (!forceRebuild && syncGutterLabels._lastRebuildAt
        && nowR - syncGutterLabels._lastRebuildAt < 450
        && oldRowN > 0) {
        highlightGutterLabelRows(rows, findCurrentNavIndex(), true);
        return;
      }
      syncGutterLabels._lastRebuildAt = nowR;
      gutterLabelsSig = sig;
      gutterLabelsCurIdx = -1; // 重建后强制一次跟随 scroll
      const cur = findCurrentNavIndex();
      const html = navList.map((item, i) => {
        const on = i === cur ? ' dwt-gl-current' : '';
        const raw = normalizeNavText(item.text || '');
        const safe = String(raw).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        const dataText = safe.replace(/"/g, '&quot;');
        // data-text = 纯提问（不含序号）；验收勿读 row.textContent（会得到「1枫」）
        return '<div class="dwt-gl-row' + on + '" data-idx="' + i + '" data-text="' + dataText
          + '" title="' + dataText + '">'
          + '<span class="dwt-gl-num">' + (i + 1) + '</span>'
          + '<span class="dwt-gl-text">' + safe + '</span></div>';
      }).join('');
      rows.innerHTML = html || '<div class="dwt-gl-row" style="color:#8b949e;cursor:default;font-size:11px;padding:6px;justify-content:center;">暂无提问</div>';
      if (foot) {
        const ft = '共 ' + navList.length + ' 条';
        if (foot.textContent !== ft) foot.textContent = ft;
      }
      highlightGutterLabelRows(rows, cur, skipScroll);
    } else {
      highlightGutterLabelRows(rows, findCurrentNavIndex(), skipScroll);
      if (foot) {
        const ft = '共 ' + navList.length + ' 条';
        if (foot.textContent !== ft) foot.textContent = ft;
      }
    }
    // 节流验收 beacon（boot-stub 每 4s 覆盖 verify，需周期性重报）
    try {
      const now = Date.now();
      if (!syncGutterLabels._beaconAt || now - syncGutterLabels._beaconAt > 3000) {
        syncGutterLabels._beaconAt = now;
        postNavBeacon({ reason: 'gutter-labels-sync' });
      }
    } catch (eB) { /* ignore */ }
  }

  let gutterMode = false;
  let gutterObserver = null;

  // 「用户现在看到的是不是轨道态」以 DOM 事实为准：class 才是样式来源，
  // gutterMode 只是内存标志 —— 后台标签里 rAF 被饿死时它会滞后，beacon 不能跟着说谎。
  function gutterActive() {
    return gutterMode || document.documentElement.classList.contains('dwt-native-gutter');
  }

  // 一次会话内美化失败则不再重试，避免反复 inject/remove 闪原生 / 闪面板
  let gutterGaveUp = false;
  let gutterFailStreak = 0;
  let gutterWheelBridgeEl = null;
  let gutterWheelBridgeHandler = null;

  function detachGutterWheelBridge() {
    if (gutterWheelBridgeEl && gutterWheelBridgeHandler) {
      try {
        gutterWheelBridgeEl.removeEventListener('wheel', gutterWheelBridgeHandler, true);
      } catch (e) { /* ignore */ }
    }
    gutterWheelBridgeEl = null;
    gutterWheelBridgeHandler = null;
  }

  let gutterTipHoverEl = null;
  let gutterTipHoverHandler = null;
  let gutterTipLeaveHandler = null;

  function detachGutterTipHover() {
    if (gutterTipHoverEl && gutterTipHoverHandler) {
      try { gutterTipHoverEl.removeEventListener('mouseover', gutterTipHoverHandler, true); } catch (e) { /* ignore */ }
    }
    if (gutterTipHoverEl && gutterTipLeaveHandler) {
      try { gutterTipHoverEl.removeEventListener('mouseleave', gutterTipLeaveHandler, true); } catch (e) { /* ignore */ }
    }
    gutterTipHoverEl = null;
    gutterTipHoverHandler = null;
    gutterTipLeaveHandler = null;
  }

  function attachGutterTipHover(root) {
    detachGutterTipHover();
    if (!root) return;
    gutterTipHoverHandler = function (e) {
      if (!document.documentElement.classList.contains('dwt-native-gutter')) return;
      const btn = e.target.closest?.('button, [class*="rounded-full"]');
      if (!btn || !root.contains(btn)) return;
      const buttons = root.querySelectorAll('button, [class*="rounded-full"]');
      let bi = -1;
      buttons.forEach((el, i) => { if (el === btn || el.contains(btn)) bi = i; });
      if (bi < 0 || !navList.length) return;
      const idx = Math.round((bi / Math.max(1, buttons.length - 1)) * (navList.length - 1));
      const item = navList[idx];
      if (item) showGutterTip(item.text, btn);
    };
    gutterTipLeaveHandler = function () { hideGutterTip(); };
    root.addEventListener('mouseover', gutterTipHoverHandler, true);
    root.addEventListener('mouseleave', gutterTipLeaveHandler, true);
    gutterTipHoverEl = root;
  }

  /** 挪右后宿主 React onWheel 常失效：把刻度列滚轮桥到主会话 scroller */
  function attachGutterWheelBridge() {
    detachGutterWheelBridge();
    const tick = findTickColumn();
    const gut = findNativeGutter();
    const root = tick || gut;
    if (!root) return;
    gutterWheelBridgeHandler = function (e) {
      if (!document.documentElement.classList.contains('dwt-native-gutter')) return;
      const sc = getScroller();
      if (!sc) return;
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      if (max <= 0 && !e.deltaY) return;
      // 阻止默认（刻度自身 scrollH≈clientH 时本就不会滚）并驱动主列表
      try { e.preventDefault(); } catch (err) { /* ignore */ }
      try { e.stopPropagation(); } catch (err) { /* ignore */ }
      const next = Math.min(max, Math.max(0, sc.scrollTop + (e.deltaY || 0)));
      if (next !== sc.scrollTop) sc.scrollTop = next;
      // rAF 合并：只切刻度/行 class，滑动中不 scrollIntoView（破反馈环）
      try { markGutterTickCurrent({ skipScroll: true }); } catch (err) { /* ignore */ }
      // 松手后被动 nearest 跟随一次（对齐原 #dwt-nav）
      if (markTimer) clearTimeout(markTimer);
      markTimer = setTimeout(() => {
        try { markCurrent(); } catch (err2) { /* ignore */ }
      }, 140);
    };
    root.addEventListener('wheel', gutterWheelBridgeHandler, { capture: true, passive: false });
    gutterWheelBridgeEl = root;
    attachGutterTipHover(root);
  }

  function ensurePanelMounted() {
    if (!document.getElementById(PANEL_ID)) {
      mount();
      startLiveWatch();
      loadAll();
    }
  }

  /** gutter 优先：锁定后只维持右侧原生栏；连续失败才回退自定义面板 */
  function ensureNavAlive() {
    if (!isActiveNav()) return;
    if (USE_NATIVE_GUTTER_CSS && !gutterGaveUp) {
      if (!gutterMode) {
        enableGutterMode({ force: false });
        return;
      }
      // 宿主 React 会摘掉外来子节点：先补齐列表挂载再判可见性，别把「列表被摘」误判成轨道失效
      try { syncGutterLabels(); } catch (eS) { /* ignore */ }
      if (findNativeGutter() && isGutterVisuallyOk()) {
        gutterFailStreak = 0;
        hideCustomPanel();
        // 同 rev 热路径也可能残留旧 #dwt-gutter-style：每次确认成功态时重写 CSS
        injectGutterBeautifyCss();
        attachGutterWheelBridge();
        syncGutterCountBadge();
        markGutterTickCurrent();
        return;
      }
      gutterFailStreak++;
      // 短暂抖动（滚轮/虚拟列表）不回退，避免双栏闪烁
      if (gutterFailStreak < 5) {
        hideCustomPanel();
        return;
      }
      console.warn('[cs][doubao-web-toolkit] gutter lost after streak; fallback panel');
      gutterGaveUp = true;
      disableGutterMode();
    }
    ensurePanelMounted();
    forcePanelVisible();
    if (!isPanelVisuallyOk()) forcePanelVisible();
  }

  function enableGutterMode(opts) {
    opts = opts || {};
    if (opts.force) {
      gutterGaveUp = false;
      gutterFailStreak = 0;
    }
    if (gutterGaveUp) return false;
    if (!findNativeGutter()) return false;
    // DOM 可保留面板节点供 stub，但立刻按 gutter 样式隐藏
    ensurePanelMounted();
    injectGutterBeautifyCss();
    document.documentElement.classList.add('dwt-native-gutter');
    hideCustomPanel();
    // 列表必须先挂进原生栏：否则 isGutterVisuallyOk 的「列表在栏内」不变量首轮必然失败 → 误判回退
    try { syncGutterLabels({ forceRebuild: true }); } catch (eS) { /* ignore */ }
    const finish = () => {
      if (!isGutterVisuallyOk()) {
        console.warn('[cs][doubao-web-toolkit] gutter CSS move failed; keep #dwt-nav');
        gutterGaveUp = true;
        disableGutterMode();
        ensurePanelMounted();
        forcePanelVisible();
        return false;
      }
      gutterMode = true;
      gutterFailStreak = 0;
      hideCustomPanel();
      attachGutterWheelBridge();
      syncGutterCountBadge();
      markGutterTickCurrent();
      if (!gutterObserver) {
        gutterObserver = new MutationObserver((records) => {
          if (!gutterMode) return;
          // 列表现在挂在原生栏内：自家列表的 DOM 变化（行重建 / 页脚文本）也会落进这个 observer，
          // 照单全收就会 observer→sync→再改 DOM 自激成死循环（真机把页面跑死过一次）。
          const labels = document.getElementById(GUTTER_LABELS_ID);
          const external = (records || []).some((rec) => {
            const t = rec.target;
            if (labels && t && labels.contains(t)) return false;
            if (labels && t === labels.parentElement) return false;
            return true;
          });
          if (!external) return;
          syncGutterCountBadge();
          // 不在 observer 里立刻 fallback，交给 ensureNavAlive 的 streak
        });
        const root = findNativeGutter();
        if (root) gutterObserver.observe(root, { childList: true, subtree: true });
      }
      console.log('[cs][doubao-web-toolkit] navigator gutter-css mode (nav-rev ' + NAV_REV + ')');
      return true;
    };
    // 三层 rAF 不能是唯一通路：后台标签实测 visibilityState=visible 却 1.8s 内 0 次回调
    // （rAF 被渲染器饿死）→ finish 永不执行，gutterMode 卡 false，心跳每 2.5s 重建整表。
    // 900ms 看门狗兜底强制收尾一次；谁先到谁生效。
    let finished = false;
    const finishOnce = () => {
      if (finished) return;
      finished = true;
      finish();
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(finishOnce);
      });
    });
    setTimeout(finishOnce, 900);
    return true;
  }

  function disableGutterMode() {
    gutterMode = false;
    gutterFailStreak = 0;
    document.documentElement.classList.remove('dwt-native-gutter');
    document.documentElement.classList.remove('dwt-gutter-ok');
    detachGutterTipHover();
    detachGutterWheelBridge();
    try { gutterObserver?.disconnect(); } catch (e) { /* ignore */ }
    gutterObserver = null;
    hideGutterTip();
    document.getElementById(GUTTER_COUNT_ID)?.remove();
    document.getElementById(GUTTER_LABELS_ID)?.remove();
    document.getElementById(GUTTER_TIP_ID)?.remove();
    document.getElementById(GUTTER_STYLE_ID)?.remove();
    const col = findTickColumn();
    if (col) {
      Array.from(col.children).forEach((el) => el.classList.remove('dwt-tick-current'));
    }
  }

  function destroy() {
    scanGen++;
    scanning = false;
    try { liveObserver?.disconnect(); } catch (e) { /* ignore */ }
    liveObserver = null;
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (markTimer) { clearTimeout(markTimer); markTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (routeTimer) { clearInterval(routeTimer); routeTimer = null; }
    if (routeCheckFn) {
      try { window.removeEventListener('popstate', routeCheckFn); } catch (eR) { /* ignore */ }
      routeCheckFn = null;
    }
    if (gutterHighlightRaf) { cancelAnimationFrame(gutterHighlightRaf); gutterHighlightRaf = 0; }
    try { document.removeEventListener('scroll', onScrollMark, true); } catch (e) { /* ignore */ }
    disableGutterMode();
    try {
      document.getElementById(PANEL_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(GUTTER_STYLE_ID)?.remove();
      document.getElementById(GUTTER_COUNT_ID)?.remove();
      document.getElementById(GUTTER_LABELS_ID)?.remove();
      document.getElementById(GUTTER_TIP_ID)?.remove();
    } catch (e) { /* ignore */ }
  }

  dwt.navigatorModule = {
    rev: NAV_REV,
    mode: function () { return gutterActive() ? 'gutter-css' : 'panel'; },
    // 供验收/诊断读：空会话卡片是「有意隐藏」而非「没挂上」
    emptyHidden: function () { return navEmptyHidden; },
    // 内存标志原文（mode() 已是 DOM 事实，看门狗是否真的收尾得看这个）
    gutterFlag: function () { return gutterMode; },
    mount, collectUserQuestions, loadAll, destroy, toggleFitAll, applyFitAll,
    ensureNavAlive,
    enableGutterMode,
    retryGutter() { return enableGutterMode({ force: true }); },
    setKeyword(k) { keyword = k || ''; renderItems(); },
    markCurrent,
    jumpTo,
    findBubble,
  };

  function bootNav() {
    try {
      // rev18: 优先原生 gutter 挪右美化；成功则永久藏 #dwt-nav
      gutterGaveUp = !USE_NATIVE_GUTTER_CSS;
      gutterFailStreak = 0;
      mount();
      startLiveWatch();
      watchRouteChange();
      loadAll();
      if (USE_NATIVE_GUTTER_CSS && findNativeGutter()) {
        hideCustomPanel();
        enableGutterMode({ force: true });
      } else {
        forcePanelVisible();
      }
      setTimeout(function () {
        ensureNavAlive();
        markCurrent();
      }, 600);
      setTimeout(function () {
        ensureNavAlive();
        markCurrent();
      }, 1800);
    } catch (e) {
      console.warn('[cs][doubao-web-toolkit] navigator boot failed', e);
      try { ensurePanelMounted(); forcePanelVisible(); } catch (e2) { /* ignore */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNav);
  } else {
    bootNav();
  }
  setTimeout(function () {
    if (!isActiveNav()) return;
    ensureNavAlive();
    markCurrent();
  }, 400);
  // 心跳：维持 gutter 锁定 / 高亮；destroy 必须 clearInterval（多实例抢 labels 根因）
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(function () {
    try {
      if (!isActiveNav()) return;
      ensureNavAlive();
      markCurrent();
    } catch (e) { /* ignore */ }
  }, 2500);

  // MutationObserver: 监听气泡出现/变化, 实时追加到列表 (不用等 8 秒轮询)
  function startLiveWatch() {
    if (liveObserver) return;
    liveObserver = new MutationObserver((mutations) => {
      let dirty = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (n.matches?.(userBubbleSel()) || n.querySelector?.(userBubbleSel()))) {
              dirty = true; break;
            }
          }
        } else if (m.type === 'characterData') {
          // 流式输出中已有气泡内容变化 → 也算脏 (但不常触发, 节流)
        }
        if (dirty) break;
      }
      if (dirty) refreshList();
    });
    // 挂在 body 上, 监听整棵树
    liveObserver.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  // DOM 变化时增量合并（不强制滚扫）。豆包回收/重建气泡时靠 merge 叠窗。
  function refreshList() {
    if (scanning) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      // URL 已切会话但 interval 尚未跑到时，先按新 id 触发切换
      const id = getChatId();
      if (id && activeChatId && id !== activeChatId) {
        onChatSwitch(id);
        return;
      }
      const visible = visibleTexts();
      if (!visible.length) return;
      const oldTexts = navList.map((item) => item.text);
      // 与旧列表完全无交集 → 多半已换会话，禁止 merge 把两场对话拼在一起
      const overlap = visible.filter((t) => oldTexts.indexOf(t) >= 0).length;
      if (oldTexts.length && overlap === 0) {
        // 换会话已在上方 onChatSwitch；此处无交集多为 Fiber/虚拟窗误判，禁止整表换成视口子集（9↔37 闪死循环）
        markCurrent();
        return;
      }
      const merged = dedupePreserveOrder(mergeTexts(oldTexts, visible).filter(isEligibleNavText));
      // 同会话禁止缩表（脏源回写短列表会触发 labels 整表闪烁）
      if (merged.length < oldTexts.length) {
        markCurrent();
        return;
      }
      const changed = merged.length !== navList.length
        || merged.some((text, i) => navList[i]?.text !== text);
      if (!changed) { markCurrent(); return; }
      navList = merged.map((text) => ({ text }));
      const panel = document.getElementById(PANEL_ID);
      if (!panel) mount();
      else { renderItems(); markCurrent(); applyDark(); }
    }, 150);
  }
  // 滚动时：高亮当前 + 合并视口气泡
  document.addEventListener('scroll', onScrollMark, true);

  console.log('[cs][doubao-web-toolkit] navigator module ready (nav-rev ' + NAV_REV + ')');
})();
