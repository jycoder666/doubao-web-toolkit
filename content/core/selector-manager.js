(function () {
  'use strict';
  const dwt = window.dwt = window.dwt || {};
  const DEFAULTS = {
    input: '.ProseMirror',
    generatingSelectors: ['[class*="thinking" i]', '[class*="streaming" i]', '[class*="loading" i]', '[class*="typing" i]', '[class*="wait"]'],
    captchaSelectors: ['[class*="captcha" i]', '[class*="verify" i]', '[class*="verifycode" i]', '[id*="captcha" i]'],
  };
  dwt.selectorManager = {
    DEFAULTS,
    getInput() { return document.querySelector(DEFAULTS.input); },
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
