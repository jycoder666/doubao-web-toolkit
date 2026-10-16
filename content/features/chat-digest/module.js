// chat-digest/module.js — 长对话摘要/索引（对应总表 #30 k6G52m4Dz75W/ChatDigest、#109 ruY9527/ChatSavor）
// 功能: 本地提取当前会话的结构化摘要 —— 提问列表 + 每轮 AI 回复的首段要点 + 字数/轮次统计。
// 实现: 纯 DOM 抽取, 生成 Markdown 摘要; 可选一键复制 / 下载。不调用任何大模型接口, 不发网络请求。
// 说明: 与 navigator(仅跳转) / export(全量导出) 互补, digest 只产出「提纲级」概览。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_chat_digest';   // 功能开关
  const PANEL_ID = 'dwt-digest-panel';
  const BTN_ID = 'dwt-digest-btn';

  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const SEL_AI_CONTENT = '[class*="conversation-message-content-padding-right"]';

  let enabled = false;  // 默认关闭 (弹窗类 UI, 按需开启)

  // ---------- 抽取 ----------

  // 复用 export 模块的消息收集逻辑 (存在则复用, 否则本地实现)
  function collectMessages() {
    if (dwt.exportModule?.collectMessages) {
      try { return dwt.exportModule.collectMessages(); } catch (_) { /* fall through */ }
    }
    const results = [];
    const list = document.querySelector('[class*="message-list"]') || document;
    const seen = new Set();
    list.querySelectorAll(SEL_USER_BUBBLE).forEach((b) => {
      const t = (b.innerText || '').trim();
      if (t && !seen.has(b)) { seen.add(b); results.push({ role: 'user', text: t, node: b }); }
    });
    list.querySelectorAll(SEL_AI_CONTENT).forEach((c) => {
      if (c.closest(SEL_USER_BUBBLE)) return;
      if (c.querySelector('[class*="message-action-bar"]')) return;
      const t = (c.innerText || '').trim();
      if (t && !seen.has(c)) { seen.add(c); results.push({ role: 'assistant', text: t, node: c }); }
    });
    results.sort((a, b) => a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top);
    return results;
  }

  // 取文本首段要点: 跳过标题/列表符号, 取第一句有效文字
  function firstPoint(text) {
    const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    for (const ln of lines) {
      // 跳过纯标题 (#) / 纯代码块围栏 / 过短行
      if (/^#{1,6}\s/.test(ln)) continue;
      if (/^```/.test(ln)) continue;
      if (ln.length < 6) continue;
      const clean = ln.replace(/^[-*>\d.\s]+/, '').trim();
      if (clean.length >= 6) return clean.slice(0, 100);
    }
    return (lines[0] || text).slice(0, 100);
  }

  // 生成结构化摘要
  function buildDigest() {
    const msgs = collectMessages();
    const rounds = [];
    let cur = null;
    msgs.forEach((m) => {
      if (m.role === 'user') {
        if (cur) rounds.push(cur);
        cur = { q: m.text, a: '' };
      } else if (cur) {
        cur.a += (cur.a ? '\n' : '') + m.text;
      }
    });
    if (cur) rounds.push(cur);

    const totalChars = msgs.reduce((n, m) => n + m.text.length, 0);
    const lines = [];
    lines.push('# ' + (document.title || '豆包对话') + ' · 摘要');
    lines.push('');
    lines.push('- 轮次: **' + rounds.length + '** 轮');
    lines.push('- 消息条数: **' + msgs.length + '** 条');
    lines.push('- 总字数(约): **' + totalChars + '**');
    lines.push('- 生成时间: ' + new Date().toLocaleString('zh-CN'));
    lines.push('');
    lines.push('## 提纲');
    lines.push('');
    rounds.forEach((r, i) => {
      const q = r.q.split(/\n/)[0].slice(0, 80);
      lines.push((i + 1) + '. **' + q + '**');
      if (r.a) lines.push('   - ' + firstPoint(r.a));
    });
    return { markdown: lines.join('\n'), rounds: rounds.length, msgs: msgs.length, chars: totalChars };
  }

  // ---------- UI ----------

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) { panel.remove(); }
    const d = buildDigest();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;right:12px;top:72px;z-index:999999;width:380px;max-height:70vh;'
      + 'overflow-y:auto;background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:12px;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,.2);font-size:12px;line-height:1.6;'
      + 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#24292f;';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<b style="font-size:13px;">🧾 对话摘要</b>'
      + '<button id="dwt-digest-x" style="border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1;">×</button></div>'
      + '<div style="color:#57606a;margin-bottom:8px;">轮次 ' + d.rounds + ' · 消息 ' + d.msgs + ' · 约 ' + d.chars + ' 字</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:8px;">'
      + '<button id="dwt-digest-copy" style="flex:1;padding:5px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;">复制</button>'
      + '<button id="dwt-digest-dl" style="flex:1;padding:5px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;">下载 .md</button>'
      + '</div>'
      + '<pre style="white-space:pre-wrap;word-break:break-word;background:#f6f8fa;border-radius:6px;padding:8px;margin:0;max-height:44vh;overflow:auto;">'
      + escapeHtml(d.markdown) + '</pre>';
    document.body.appendChild(panel);

    panel.querySelector('#dwt-digest-x').onclick = () => panel.remove();
    panel.querySelector('#dwt-digest-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(d.markdown); flash(panel, '已复制 ✓'); }
      catch (_) { flash(panel, '复制失败, 请手动选择'); }
    };
    panel.querySelector('#dwt-digest-dl').onclick = () => {
      download('doubao-digest-' + Date.now() + '.md', d.markdown, 'text/markdown');
    };
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function flash(panel, msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:absolute;right:12px;top:44px;background:#1f6feb;color:#fff;'
      + 'border-radius:6px;padding:3px 8px;font-size:11px;';
    panel.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // 悬浮入口按钮
  function buildButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '🧾';
    btn.title = '生成对话摘要';
    btn.style.cssText = 'position:fixed;right:12px;bottom:56px;z-index:999998;width:32px;height:32px;'
      + 'border-radius:50%;border:1px solid #d0d7de;background:#fff;cursor:pointer;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:14px;line-height:1;';
    btn.onclick = renderPanel;
    document.body.appendChild(btn);
  }

  function mount() {
    if (!enabled) return;
    buildButton();
    console.log('[dwt-chat-digest] mounted');
  }

  function unmount() {
    const b = document.getElementById(BTN_ID);
    const p = document.getElementById(PANEL_ID);
    if (b) b.remove();
    if (p) p.remove();
  }

  async function loadConfig() {
    try {
      const r = await chrome.storage.local.get(KEY);
      enabled = r[KEY] === true; // 默认关闭
    } catch (_) { enabled = false; }
  }

  dwt.chatDigestModule = {
    mount, unmount, buildDigest, renderPanel,
    setEnabled(v) { enabled = !!v; if (enabled) mount(); else unmount(); },
    isEnabled: () => enabled,
  };

  loadConfig().then(mount);

  console.log('[doubao-web-toolkit] chat-digest module ready');
})();
