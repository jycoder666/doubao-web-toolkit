(function () {
  'use strict';
  const dwt = window.dwt = window.dwt || {};
  const DEFAULT_SEL = ['[class*="captcha" i]', '[class*="verify" i]', '[class*="verifycode" i]', '[id*="captcha" i]'];
  let selectors = DEFAULT_SEL.slice();
  let intervalId = null;
  let lastState = false;
  dwt.captchaDetector = {
    isDetected() { return selectors.some(s => document.querySelector(s) !== null); },
    start() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        const found = dwt.captchaDetector.isDetected();
        if (found !== lastState) {
          lastState = found;
          window.dispatchEvent(new CustomEvent('dwt-captcha-change', { detail: { detected: found } }));
        }
      }, 1000);
    },
    stop() { if (intervalId) { clearInterval(intervalId); intervalId = null; } },
    setSelectors(list) { selectors = list.slice(); },
  };
})();
