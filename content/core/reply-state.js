// reply-state.js — 豆包"是否正在生成回复"状态机
// 关键发现 (2026-10-16 浏览器验证):
//   豆包流式回复时, AI 消息容器会加 data-streaming="true",
//   完成后变为 data-streaming="false".
//   不使用 thinking/streaming/loading/typing/wait 这些 class 名 (全 0 命中).
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  dwt.replyState = {
    // 主检测: data-streaming="true" (豆包 2026 年的真实实现)
    // 兜底: 未来版本可能改回 class 标记, 保留作 fallback
    isGenerating() {
      if (document.querySelector('[data-streaming="true"]')) return true;
      if (document.querySelector('[data-testid*="loading" i]')) return true;
      return false;
    },

    async whenDone(opts) {
      opts = opts || {};
      const timeout = opts.timeout ?? 180000;
      // 必须先等到「开始生成」, 否则发送失败时 !isGenerating 会立刻 resolve, 状态机空转
      const startTimeout = opts.startTimeout ?? 15000;
      const t0 = Date.now();
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (this.isGenerating()) { clearInterval(timer); resolve(); }
          else if (Date.now() - t0 > startTimeout) {
            clearInterval(timer);
            reject(new Error('reply did not start within ' + startTimeout + 'ms'));
          }
        }, 200);
      });
      const genStart = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (!this.isGenerating()) { clearInterval(timer); resolve(); }
          else if (Date.now() - genStart > timeout) {
            clearInterval(timer); reject(new Error('reply timeout after ' + timeout + 'ms'));
          }
        }, 500);
      });
    },
  };
})();
