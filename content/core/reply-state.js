(function () {
  'use strict';
  const dwt = window.dwt = window.dwt || {};
  const SEL = ['[class*="thinking" i]', '[class*="streaming" i]', '[class*="loading" i]', '[class*="typing" i]', '[class*="wait"]'];
  dwt.replyState = {
    isGenerating() { return SEL.some(s => document.querySelector(s) !== null); },
    async whenDone(opts) {
      opts = opts || {};
      const timeout = opts.timeout ?? 180000;
      const start = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (!dwt.replyState.isGenerating()) { clearInterval(timer); resolve(); }
          else if (Date.now() - start > timeout) { clearInterval(timer); reject(new Error('reply timeout')); }
        }, 500);
      });
    },
  };
})();
