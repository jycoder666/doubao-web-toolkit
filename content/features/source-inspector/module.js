// source-inspector/module.js — 联网来源标注 + 可信度提示
// 功能: 扫描 AI 回复中的联网搜索来源卡片, 在回复旁挂一个「来源 N」徽标,
//       点击展开来源列表 (域名 + 标题 + 链接), 并给出域名可信度分级提示.
// 说明: 纯 DOM 读取, 不发任何网络请求; 可信度仅按域名后缀做本地启发式分级.
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_source_inspector';
  const BADGE_CLASS = 'dwt-src-badge';
  const PANEL_ID = 'dwt-src-panel';

  // ⓘ 用法说明：来源面板标题右侧（rail 无本模块入口，只挂在面板标题上）
  const HELP = {
    title: '🔗 联网来源',
    desc: '把 AI 回复里的联网来源卡片收成「来源 N」徽标，点开看清单和域名可信度。',
    rows: [
      ['怎么用', '点回复旁的 🔗 来源 N 徽标 → 展开来源列表，再点一次收起'],
      ['徽标上的「权威 M」', '这批来源里判为「高」可信的条数'],
      ['点条目', '新标签页打开原链接（不代抓取、不读正文）'],
    ],
    sections: [{
      h: '可信度怎么算',
      rows: [
        ['高', 'gov / edu / ac 类后缀，或维基、知网、Nature、IEEE 等白名单域名'],
        ['中', '常见商业站点与机构域名（百度、搜狐、新浪、腾讯新闻…）'],
        ['低', 'IP、短链、认不出的域名'],
      ],
    }],
    note: '纯本地按域名做启发式分级，不是权威判定 —— 只用来提示「这条来源值不值得点开看」。不联网、不读回复正文。',
  };

  // 可信度分级 (纯本地启发式, 非权威判定)
  const TIER = {
    HIGH: { label: '高', color: '#1a7f37', bg: '#e6f4ea' }, // 政府/教育/学术/权威媒体
    MID: { label: '中', color: '#9a6700', bg: '#fff8c5' },  // 常见商业站点/机构
    LOW: { label: '低', color: '#cf222e', bg: '#ffebe9' },  // 未知/个人/短链
  };

  const HIGH_SUFFIX = ['.gov.cn', '.edu.cn', '.ac.cn', '.org.cn', '.gov', '.edu', '.ac.uk', '.int'];
  const HIGH_HOST = ['wikipedia.org', 'zhihu.com', 'cnki.net', 'nature.com', 'science.org', 'ieee.org'];
  const MID_HOST = ['baidu.com', 'sohu.com', 'sina.com.cn', '163.com', 'qq.com', 'toutiao.com',
    'csdn.net', 'jianshu.com', 'bilibili.com', '36kr.com', 'github.com', 'medium.com', 'bbc.com', 'cnn.com'];

  let enabled = true;
  let observer = null;
  let clickHandler = null;
  let lastGroups = []; // 供事件委托按 idx 取回当前分组 (徽标会被防抖扫描重建)

  // ---------- 工具函数 ----------

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
  }

  // 豆包把外链包了一层跳转 (如 https://link.wtturl.cn/?target=<encoded>),
  // 这里解析出真实目标 URL, 拿不到则回退原链接.
  function unwrapUrl(href) {
    try {
      const u = new URL(href, location.href);
      const t = u.searchParams.get('target') || u.searchParams.get('url') || u.searchParams.get('u');
      if (t) {
        const real = decodeURIComponent(t);
        if (/^https?:\/\//i.test(real)) return real;
      }
      return u.href;
    } catch (_) { return href; }
  }

  // 域名可信度分级 (本地启发式)
  function gradeHost(host) {
    if (!host) return TIER.LOW;
    const h = host.toLowerCase();
    if (HIGH_SUFFIX.some((s) => h.endsWith(s))) return TIER.HIGH;
    if (HIGH_HOST.some((s) => h === s || h.endsWith('.' + s))) return TIER.HIGH;
    if (MID_HOST.some((s) => h === s || h.endsWith('.' + s))) return TIER.MID;
    // 含点且非 IP 的普通域名 → 中; 其余 → 低
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return TIER.MID;
    return TIER.LOW;
  }

  // 从任意 a[href] 判断是否外部链接 (排除豆包站内; 自动解包跳转链接)
  function isExternal(href) {
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    try {
      const u = new URL(unwrapUrl(href), location.href);
      return /^https?:$/.test(u.protocol)
        && !u.hostname.endsWith('doubao.com')
        && !u.hostname.endsWith('dola.com');
    } catch (_) { return false; }
  }

  // ---------- 来源扫描 ----------

  // 在指定根节点内收集来源条目 (去重, 保持文档顺序)
  function collectFrom(root) {
    const out = [];
    const seen = new Set();
    if (!root) return out;
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!isExternal(href)) return;
      const url = unwrapUrl(href);          // 解包跳转, 拿到真实目标
      if (seen.has(url)) return;
      seen.add(url);
      const title = (a.innerText || a.getAttribute('title') || a.textContent || '').trim();
      out.push({ url, host: hostOf(url), title: title.slice(0, 60) });
    });
    return out;
  }

  // 扫描整页, 返回 [{ node: AI回复容器, sources: [...] }]
  function scanSources() {
    const SEL_AI_CONTENT = dwt.selectorManager?.getAiContent?.()
      || dwt.selectorManager?.DEFAULTS?.aiContent
      || '[class*="conversation-message-content-padding-right"]';
    const groups = [];
    const containers = document.querySelectorAll(SEL_AI_CONTENT);
    containers.forEach((c) => {
      if (c.closest('[class*="bg-g-send-msg-bubble-bg"]')) return;
      const sources = collectFrom(c);
      if (sources.length) groups.push({ node: c, sources });
    });
    return groups;
  }

  // ---------- 徽标渲染 ----------

  function removeBadges() {
    document.querySelectorAll('.' + BADGE_CLASS).forEach((b) => b.remove());
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function buildBadge(group, index) {
    const sources = group.sources;
    const highCount = sources.filter((s) => gradeHost(s.host) === TIER.HIGH).length;
    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.dataset.idx = String(index);
    badge.textContent = '\u{1F517} 来源 ' + sources.length + (highCount ? ' · 权威 ' + highCount : '');
    badge.style.cssText = 'display:inline-block;margin:4px 0 0 0;padding:2px 8px;border-radius:10px;'
      + 'background:#eef3fd;color:#2d72de;border:1px solid #c8d8f8;font-size:11px;cursor:pointer;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;user-select:none;';
    // 点击统一走 document 级事件委托 (见 mount):
    // 徽标被防抖扫描不断重建, 直挂监听会点到脱离 DOM 的旧节点而失效
    return badge;
  }

  function closePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function togglePanel(group, anchor) {
    const existing = document.getElementById(PANEL_ID);
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:absolute;z-index:999997;min-width:260px;max-width:360px;'
      + 'max-height:320px;overflow-y:auto;background:var(--dwt-bg,#fff);'
      + 'border:1px solid var(--dwt-border,#d0d7de);border-radius:8px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.15);padding:10px;font-size:12px;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:var(--dwt-fg,#1a1a1a);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    header.innerHTML = '<b>联网来源 (' + group.sources.length + ')</b>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;';
    closeBtn.addEventListener('click', closePanel);
    header.appendChild(closeBtn);
    // 标题右侧 ⓘ：悬停出表格化说明（面板每次点开都重建，所以每次都要挂；attach 幂等）
    window.dwt?.helpTip?.attach?.(header.querySelector('b'), HELP);
    panel.appendChild(header);

    group.sources.forEach((s, i) => {
      const tier = gradeHost(s.host);
      const row = document.createElement('div');
      row.className = 'dwt-src-row';
      row.style.cssText = 'padding:6px;border-radius:6px;margin-bottom:4px;'
        + 'background:var(--dwt-soft,#f6f8fa);color:var(--dwt-fg,#1a1a1a);';
      const title = s.title || s.host;
      row.innerHTML = '<div style="display:flex;gap:6px;align-items:center;">'
        + '<span style="flex:0 0 auto;padding:1px 6px;border-radius:8px;font-size:10px;color:' + tier.color
        + ';background:' + tier.bg + ';">可信度 ' + tier.label + '</span>'
        + '<a href="' + s.url + '" target="_blank" rel="noopener" style="color:#2d72de;text-decoration:none;'
        + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(title) + '</a></div>'
        + '<div style="color:var(--dwt-muted,#8b949e);font-size:11px;margin-top:2px;">' + escapeHtml(s.host) + '</div>';
      panel.appendChild(row);
    });

    buildVerifyFooter(group, panel);

    document.body.appendChild(panel);
    // 定位到徽标下方（拖过就按落盘位置，attach 里的 restore 会覆盖这里的默认锚定）
    const r = anchor.getBoundingClientRect();
    panel.style.top = (window.scrollY + r.bottom + 6) + 'px';
    panel.style.left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 380) + 'px';
    // 拖拽：面板头为把手（absolute 定位的面板拖起来会切到 fixed，见 core/panel-drag.js）
    window.dwt?.drag?.attach?.(panel, { key: 'src', handle: header });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- 二次追问核实 (#82 asktwice) ----------
  // 把核实提示插入输入框; 禁止 pm.innerHTML 直写 (ProseMirror removeChild 崩页),
  // 必须走输入事件链 (execCommand → input)。
  function insertVerify(text) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) return false;
    pm.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(pm);
      sel.collapseToEnd();
      const hasText = (pm.textContent || '').trim().length > 0;
      if (hasText) document.execCommand('insertParagraph');
      if (!document.execCommand('insertText', false, text)) throw new Error('execCommand rejected');
      return true;
    } catch (_) {
      try {
        pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        return true;
      } catch (_) { return false; }
    }
  }

  function buildVerifyFooter(group, panel) {
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:6px;margin-top:8px;border-top:1px solid var(--dwt-soft,#eef1f4);padding-top:8px;';
    const askBtn = document.createElement('button');
    askBtn.type = 'button';
    askBtn.textContent = '🔍 二次追问核实';
    askBtn.title = '在输入框插入一条追问, 让豆包核实上述来源的真实性与准确性';
    askBtn.style.cssText = 'flex:1;padding:5px 0;border-radius:6px;cursor:pointer;font-size:11px;'
      + 'border:1px solid var(--dwt-accent,#2d72de);color:var(--dwt-accent,#2d72de);'
      + 'background:var(--dwt-soft,#fff);';
    askBtn.addEventListener('click', () => {
      const hosts = group.sources.map((s) => s.host).slice(0, 5).join('、');
      const ok = insertVerify('请逐条核实你上述回答引用的来源（' + hosts
        + '）的真实性与内容准确性：标注不确定或无法访问的条目，并补充可验证的依据链接。');
      askBtn.textContent = ok ? '已插入输入框 ✓' : '未找到输入框';
      if (ok) setTimeout(closePanel, 700);
    });
    foot.appendChild(askBtn);
    panel.appendChild(foot);
  }

  // ---------- 主流程 ----------

  function annotate() {
    if (!enabled) return;
    // 面板打开期间跳过重扫: 徽标重建会连带 removeBadges 把刚打开的面板秒删
    if (document.getElementById(PANEL_ID)) return;
    removeBadges();
    const groups = scanSources();
    lastGroups = groups;
    groups.forEach((g, i) => {
      const badge = buildBadge(g, i);
      g.node.appendChild(badge);
    });
  }

  // 防抖: 页面 DOM 频繁变化时避免高频重扫
  let debounceTimer = null;
  function scheduleAnnotate() {
    if (!enabled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(annotate, 800);
  }

  function mount() {
    if (!enabled) return;
    if (observer) return;
    observer = new MutationObserver(scheduleAnnotate);
    // 原: document.querySelector('[class*="message-list"]') || document.body
    // 问题: 豆包页面无 message-list, 始终回退 document.body, 观察范围过大.
    // 修复: 通过 selectorManager.getMessageList() 取真实容器.
    const sm = dwt.selectorManager;
    const root = (sm && sm.getMessageList && sm.getMessageList()) || document.body;
    observer.observe(root, { childList: true, subtree: true });
    // 徽标点击统一事件委托: 徽标被防抖扫描重建后, 直挂监听会随旧节点一起失效
    if (!clickHandler) {
      clickHandler = (e) => {
        const b = e.target && e.target.closest ? e.target.closest('.' + BADGE_CLASS) : null;
        if (!b) return;
        const g = lastGroups[Number(b.dataset.idx)];
        if (g) { e.preventDefault(); togglePanel(g, b); }
      };
      document.addEventListener('click', clickHandler);
    }
    scheduleAnnotate();
    console.log('[cs][dwt-source-inspector] mounted');
  }

  function unmount() {
    if (observer) { observer.disconnect(); observer = null; }
    if (clickHandler) { document.removeEventListener('click', clickHandler); clickHandler = null; }
    removeBadges();
  }

  async function loadConfig() {
    try {
      const r = await chrome.storage.local.get(KEY);
      enabled = r[KEY] !== false; // 默认开启
    } catch (_) { enabled = true; }
  }

  dwt.sourceInspectorModule = {
    scanSources,
    collectFrom,
    gradeHost,
    unwrapUrl,
    annotate,
    mount,
    unmount,
    setEnabled(v) { enabled = !!v; if (enabled) mount(); else unmount(); },
    isEnabled: () => enabled,
  };

  loadConfig().then(mount);

  console.log('[cs][doubao-web-toolkit] source-inspector module ready');
})();
