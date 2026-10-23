(function () {
  'use strict';
  const dwt = window.dwt = window.dwt || {};
  const DEFAULT_SEL = ['[class*="captcha" i]', '[class*="verify" i]', '[class*="verifycode" i]', '[id*="captcha" i]'];
  let selectors = DEFAULT_SEL.slice();
  let intervalId = null;
  let lastState = false;
  // 调试面板可覆盖验证码选择器；每次检测都取最新生效值
  function currentSelectors() {
    const fromPanel = dwt.selectorManager?.getCaptchaSelectors?.();
    return (Array.isArray(fromPanel) && fromPanel.length) ? fromPanel : selectors;
  }
  dwt.captchaDetector = {
    isDetected() {
      return currentSelectors().some((s) => {
        try { return document.querySelector(s) !== null; } catch (_) { return false; }
      });
    },
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
