// export/module.js — 对话导出: Markdown 单会话 + JSON 全量
// 传统脚本: IIFE + window.dwt
// 顶部维护:
//   - 原实现用 [class*="message-list"] 限定搜索范围, 但豆包页面上此 class 不存在,
//     导致 collectMessages 始终返回空数组, 导出"未找到对话内容"。
//   - 修复: 通过 dwt.selectorManager.getMessageList() 取真实容器 (优先内部滚动容器
//     div.v_list_scroller-*, 无则 document.body)。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  const SEL_USER_BUBBLE = '[class*="bg-g-send-msg-bubble-bg"]';
  const SEL_AI_CONTENT = '[class*="conversation-message-content-padding-right"]';

  // 取消息列表根容器 (优先真实滚动容器, 无则 document.body)
  function getMsgList() {
    const sm = dwt.selectorManager;
    if (sm && sm.getMessageList) return sm.getMessageList();
    return document.body;
  }

  function collectMessages() {
    const results = [];
    const visited = new Set();
    const list = getMsgList();

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
      if (c.closest(SEL_USER_BUBBLE)) return;
      if (c.querySelector('[class*="message-action-bar"]')) return;
      const t = (c.innerText || '').trim();
      if (t && !visited.has(c)) {
        visited.add(c);
        results.push({ role: 'assistant', text: t, node: c });
      }
    });

    results.sort((a, b) => a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top);
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
  };

  window.addEventListener('dwt-export-chat', (e) => {
    const fmt = e.detail?.format || 'md';
    if (fmt === 'json') dwt.exportModule.exportJSON();
    else dwt.exportModule.exportMarkdown();
  });

  console.log('[cs][doubao-web-toolkit] export module ready');
})();
