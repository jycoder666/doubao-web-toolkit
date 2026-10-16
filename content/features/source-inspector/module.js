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
    const SEL_AI_CONTENT = dwt.selectorManager?.DEFAULTS?.aiContent
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
    badge.textContent = '🔗 来源 ' + sources.length + (highCount ? ' · 权威 ' + highCount : '');
    badge.style.cssText = 'display:inline-block;margin:4px 0 0 0;padding:2px 8px;border-radius:10px;'
      + 'background:#eef3fd;color:#2d72de;border:1px solid #c8d8f8;font-size:11px;cursor:pointer;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;user-select:none;';
    badge.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(group, badge); });
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
      + 'max-height:320px;overflow-y:auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.15);padding:10px;font-size:12px;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    header.innerHTML = '<b>联网来源 (' + group.sources.length + ')</b>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;';
    closeBtn.addEventListener('click', closePanel);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    group.sources.forEach((s, i) => {
      const tier = gradeHost(s.host);
      const row = document.createElement('div');
      row.style.cssText = 'padding:6px;border-radius:6px;margin-bottom:4px;background:#f6f8fa;';
      const title = s.title || s.host;
      row.innerHTML = '<div style="display:flex;gap:6px;align-items:center;">'
        + '<span style="flex:0 0 auto;padding:1px 6px;border-radius:8px;font-size:10px;color:' + tier.color
        + ';background:' + tier.bg + ';">可信度 ' + tier.label + '</span>'
        + '<a href="' + s.url + '" target="_blank" rel="noopener" style="color:#2d72de;text-decoration:none;'
        + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(title) + '</a></div>'
        + '<div style="color:#8b949e;font-size:11px;margin-top:2px;">' + escapeHtml(s.host) + '</div>';
      panel.appendChild(row);
    });

    document.body.appendChild(panel);
    // 定位到徽标下方
    const r = anchor.getBoundingClientRect();
    panel.style.top = (window.scrollY + r.bottom + 6) + 'px';
    panel.style.left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 380) + 'px';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- 主流程 ----------

  function annotate() {
    if (!enabled) return;
    removeBadges();
    const groups = scanSources();
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
    const root = document.querySelector('[class*="message-list"]') || document.body;
    observer.observe(root, { childList: true, subtree: true });
    scheduleAnnotate();
    console.log('[dwt-source-inspector] mounted');
  }

  function unmount() {
    if (observer) { observer.disconnect(); observer = null; }
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

  console.log('[doubao-web-toolkit] source-inspector module ready');
})();
