// captcha-detector.js —— 每秒轮询验证码 selector
// 变化时 window.dispatchEvent(new CustomEvent('dwt-captcha-change'))

const CAPTCHA_SELECTORS = [
  '[class*="captcha" i]',
  '[class*="verify" i]',
  '[class*="verifycode" i]',
  '[id*="captcha" i]',
];

let intervalId = null;
let lastState = false;

function scan() {
  const found = CAPTCHA_SELECTORS.some((sel) => document.querySelector(sel) !== null);
  if (found !== lastState) {
    lastState = found;
    window.dispatchEvent(new CustomEvent('dwt-captcha-change', { detail: { detected: found } }));
  }
  return found;
}

export default {
  // 是否检测到验证码
  isDetected() {
    return scan();
  },

  // 启动持续轮询
  start() {
    if (intervalId) return;
    intervalId = setInterval(scan, 1000);
  },

  stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  },

  // 设自定义 selector（调试面板里）
  setSelectors(selectors) {
    CAPTCHA_SELECTORS.length = 0;
    selectors.forEach((s) => CAPTCHA_SELECTORS.push(s));
  },
};
