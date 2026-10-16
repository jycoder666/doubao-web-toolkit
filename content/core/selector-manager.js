// selector-manager.js — 选择器注册表
// 传统脚本: 挂到 window.dwt 全局命名空间
(function () {
  'use strict';

  const DEFAULTS = {
    // 输入框 —— ProseMirror (tiptap 编辑器)
    input: '.ProseMirror',

    // AI 回复内容容器 (用于导出 / 来源标注)
    aiContent: '[class*="conversation-message-content-padding-right"]',

    // 用户消息气泡
    userBubble: '[class*="bg-g-send-msg-bubble-bg"]',

    // 左侧会话列表容器 (用于对话管理)
    conversationList: '[class*="conversation-list"], [class*="session-list"]',

    // 发送按钮 —— 特征匹配: disabled=false + has svg + top>550 + 靠右
    sendMatch: (btn) => {
      const r = btn.getBoundingClientRect();
      return !btn.disabled
        && btn.querySelector('svg') !== null
        && r.top > 550
        && Math.abs(r.right - window.innerWidth) < 120;
    },

    // "正在生成回复" —— 豆包回复中会出现 loading / thinking 元素
    generatingSelectors: [
      '[class*="thinking" i]',
      '[class*="streaming" i]',
      '[class*="loading" i]',
      '[class*="typing" i]',
      '[class*="wait"]',
    ],

    // 验证码
    captchaSelectors: [
      '[class*="captcha" i]',
      '[class*="verify" i]',
      '[class*="verifycode" i]',
      '[id*="captcha" i]',
    ],
  };

  const dwt = window.dwt = window.dwt || {};
  dwt.selectorManager = {
    DEFAULTS,
    // 用户覆盖的值 (从 chrome.storage.local 读)
    _overrides: {},

    async load() {
      try {
        const r = await chrome.storage.local.get('dwt_selectors');
        this._overrides = r.dwt_selectors || {};
      } catch (_) { this._overrides = {}; }
      return { ...DEFAULTS, ...this._overrides };
    },

    async save(overrides) {
      this._overrides = overrides;
      try { await chrome.storage.local.set({ dwt_selectors: overrides }); } catch (_) {}
    },

    // 获取输入框元素
    getInput() {
      return document.querySelector(this._overrides.input || DEFAULTS.input);
    },

    // 获取发送按钮 (用特征匹配, 更稳)
    getSend() {
      const btns = document.querySelectorAll('button');
      let best = null, bestRight = -1;
      for (const b of btns) {
        if (b.disabled) continue;
        if (!b.querySelector('svg')) continue;
        const r = b.getBoundingClientRect();
        if (r.top <= 550) continue;
        // 优先匹配豆包专属 class
        if (b.className && b.className.indexOf('bg-g-send-msg-btn') >= 0) return b;
        if (r.right > bestRight) { bestRight = r.right; best = b; }
      }
      return best;
    },

    // 等待发送按钮出现 (输入框有内容后才渲染, React 状态更新有延迟)
    waitForSend(timeoutMs) {
      timeoutMs = timeoutMs || 10000;
      const start = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          const btn = this.getSend();
          if (btn) { clearInterval(timer); resolve(btn); }
          else if (Date.now() - start > timeoutMs) {
            clearInterval(timer); reject(new Error('waitForSend timeout'));
          }
        }, 200);
      });
    },
  };
})();
