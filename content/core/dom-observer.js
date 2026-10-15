// dom-observer.js —— 轻量 MutationObserver 封装
// 被 reply-state / captcha-detector / 批量输入 等模块复用

export function waitForElement(selector, opts = {}) {
  const { timeout = 10000, root = document } = opts;
  return new Promise((resolve, reject) => {
    const el = root.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(root, { childList: true, subtree: true });
    if (timeout > 0) {
      setTimeout(() => {
        obs.disconnect();
        reject(new Error(`waitForElement timeout: ${selector}`));
      }, timeout);
    }
  });
}

export function onAttrChange(target, attr, cb) {
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === attr) cb();
    }
  });
  obs.observe(target, { attributes: true, attributeFilter: [attr] });
  return () => obs.disconnect();
}
