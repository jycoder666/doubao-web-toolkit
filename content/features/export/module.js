// export/module.js — 对话导出: Markdown 单会话 + JSON 全量
// 传统脚本: IIFE + window.dwt
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  // 选择器识别
  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const SEL_AI_CONTENT = '[class*="conversation-message-content-padding-right"]';
  const SEL_IGNORE = '[class*="message-action-bar"], [class*="suggest-message-list"]';

  function collectMessages() {
    // 豆包对话 DOM 遍历: 先找所有顶层消息容器, 判断用户还是 AI
    const results = [];
    const visited = new Set();

    // 策略: 找对话列表容器, 遍历其直接子元素
    const list = document.querySelector('[class*="message-list"]');
    if (!list) return results;

    // 收集可能的消息内容元素
    const userBubbles = list.querySelectorAll(SEL_USER_BUBBLE);
    userBubbles.forEach((b) => {
      const t = (b.innerText || '').trim();
      if (t && !visited.has(b)) {
        visited.add(b);
        results.push({ role: 'user', text: t, node: b });
      }
    });

    const aiContents = list.querySelectorAll(SEL_AI_CONTENT);
    aiContents.forEach((c) => {
      // 跳过嵌套在用户气泡里的
      if (c.closest(SEL_USER_BUBBLE)) return;
      // 跳过操作栏
      if (c.querySelector('[class*="message-action-bar"]')) return;
      const t = (c.innerText || '').trim();
      if (t && !visited.has(c)) {
        visited.add(c);
        results.push({ role: 'assistant', text: t, node: c });
      }
    });

    // 按 DOM 位置排序
    results.sort((a, b) => {
      return a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top;
    });

    return results;
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
    toMarkdown,
    toJSON,
    exportMarkdown() {
      const msgs = collectMessages();
      if (!msgs.length) { alert('未找到对话内容'); return; }
      download('doubao-chat-' + Date.now() + '.md', toMarkdown(msgs), 'text/markdown');
    },
    exportJSON() {
      const msgs = collectMessages();
      if (!msgs.length) { alert('未找到对话内容'); return; }
      download('doubao-chat-' + Date.now() + '.json', toJSON(msgs), 'application/json');
    },
    showDialog() {
      const msgs = collectMessages();
      const md = toMarkdown(msgs);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
      wrap.innerHTML = '<div style="background:#fff;border-radius:8px;padding:16px;width:640px;max-height:80vh;overflow:auto;font-family:monospace;font-size:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><b>对话预览 (' + msgs.length + ' 条)</b><button onclick="this.closest(\'div\').parentElement.remove()">关闭</button></div><pre style="white-space:pre-wrap;">' + md.replace(/</g,'&lt;') + '</pre><div style="margin-top:8px;"><button id="dwt-export-md" style="margin-right:8px;padding:4px 12px;">导出 Markdown</button><button id="dwt-export-json" style="padding:4px 12px;">导出 JSON</button></div></div>';
      document.body.appendChild(wrap);
      wrap.querySelector('#dwt-export-md').onclick = () => { dwt.exportModule.exportMarkdown(); wrap.remove(); };
      wrap.querySelector('#dwt-export-json').onclick = () => { dwt.exportModule.exportJSON(); wrap.remove(); };
    },
  };

  // 响应 popup/debug-panel 指令
  window.addEventListener('dwt-export-chat', (e) => {
    const fmt = e.detail?.format || 'md';
    if (fmt === 'json') dwt.exportModule.exportJSON();
    else dwt.exportModule.exportMarkdown();
  });

  console.log('[doubao-web-toolkit] export module ready');
})();
