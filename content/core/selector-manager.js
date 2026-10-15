// selector-manager.js — 选择器注册表
// 传统脚本: 挂到 window.dwt 全局命名空间
(function () {
  'use strict';

  const DEFAULTS = {
    // 输入框 —— ProseMirror (tiptap 编辑器)
    input: '.ProseMirror',

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
        if (r.right > bestRight) { bestRight = r.right; best = b; }
      }
      return best;
    },
  };
})();
