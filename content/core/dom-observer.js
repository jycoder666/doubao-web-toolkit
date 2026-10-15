(function () {
  'use strict';
  const dwt = window.dwt = window.dwt || {};
  dwt.domObserver = {
    waitForElement(selector, opts) {
      opts = opts || {};
      const root = opts.root || document;
      const timeout = opts.timeout ?? 10000;
      return new Promise((resolve, reject) => {
        const el = root.querySelector(selector);
        if (el) return resolve(el);
        const obs = new MutationObserver(() => {
          const el = root.querySelector(selector);
          if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(root, { childList: true, subtree: true });
        if (timeout > 0) setTimeout(() => { obs.disconnect(); reject(new Error('waitForElement timeout: ' + selector)); }, timeout);
      });
    },
  };
})();
