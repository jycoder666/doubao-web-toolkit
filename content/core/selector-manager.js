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

    // 消息列表根容器 (用于导出 / source-inspector 等模块限定搜索范围)
    messageList: '[class*="v_list_scroller"], [class*="message-list"], [class*="scroller"]',

    // 真实滚动容器选择器 (豆包聊天区滚动发生在内部 div.v_list_scroller-* 上)
    // 说明: window 不滚动, 必须用此选择器找到内部容器, 否则 scrollTop 恒为 0
    scrollerCandidates: '[class*="v_list_scroller"], [class*="message-list"], [class*="scroller"]',

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
      // 只认真实发送钮。空输入时豆包会隐藏它；切勿回落到同排工具 chip。
      const wrapped = document.querySelector('.send-btn-wrapper button');
      if (wrapped && !wrapped.disabled) {
        const wr = wrapped.getBoundingClientRect();
        if (wr.width > 0 && wr.height > 0) return wrapped;
      }
      const byCls = document.querySelector('button[class*="bg-g-send-msg-btn"]');
      if (byCls && !byCls.disabled) {
        const r = byCls.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return byCls;
      }
      return null;
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

    // 找到豆包聊天区的真实滚动容器 (优先 v_list_scroller; 取可滚动且面积最大者)
    // 说明: 豆包 window 不滚动, 内部容器才滚动; 此函数供所有需要滚动/定位消息的模块复用
    _scrollerCache: null,
    _scrollerBoundEl: null,
    getScroller() {
      // 缓存有效 (元素仍在 DOM 中) 直接返回
      if (this._scrollerCache && this._scrollerCache.isConnected) return this._scrollerCache;
      const sel = this._overrides.scrollerCandidates || DEFAULTS.scrollerCandidates;
      let best = null;
      let bestArea = 0;
      document.querySelectorAll(sel).forEach((el) => {
        // 不可滚动 (高度相等或几乎相等) 的容器跳过
        if (el.scrollHeight <= el.clientHeight + 20) return;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      });
      this._scrollerCache = best;
      return best;
    },

    // 获取消息列表根容器 (优先真实滚动容器, 无则 document.body)
    getMessageList() {
      const sc = this.getScroller();
      if (sc) return sc;
      // 兜底: 用 messageList 选择器 (面积最大的候选)
      const sel = this._overrides.messageList || DEFAULTS.messageList;
      let best = null, bestArea = 0;
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      });
      return best || document.body;
    },

    // 清除内部缓存 (切换会话/路由变化时调用, 保证下次 getScroller 重新探测)
    invalidate() {
      this._scrollerCache = null;
    },
  };
})();
