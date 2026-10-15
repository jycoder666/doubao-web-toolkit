// captcha-detector.js — 每秒轮询验证码 selector, 变化时发 CustomEvent
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const DEFAULT_SEL = [
    '[class*="captcha" i]',
    '[class*="verify" i]',
    '[class*="verifycode" i]',
    '[id*="captcha" i]',
  ];
  let selectors = DEFAULT_SEL.slice();
  let intervalId = null;
  let lastState = false;

  dwt.captchaDetector = {
    isDetected() {
      return selectors.some(s => document.querySelector(s) !== null);
    },

    start() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        const found = this.isDetected();
        if (found !== lastState) {
          lastState = found;
          window.dispatchEvent(new CustomEvent('dwt-captcha-change', { detail: { detected: found } }));
        }
      }, 1000);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    },

    setSelectors(list) { selectors = list.slice(); },
  };
})();
