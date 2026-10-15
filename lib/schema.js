// lib/schema.js — chrome.storage.local keys (集中定义)
(function () {
  'use strict';

  const KEYS = {
    FEATURES: 'dwt_features',
    SELECTORS: 'dwt_selectors',
    BATCH_JSON: 'dwt_batch_json',
    BATCH_LINES: 'dwt_batch_lines',
    MIN_INTERVAL: 'dwt_min_interval',
    REPLY_TIMEOUT: 'dwt_reply_timeout',
  };

  const dwt = window.dwt = window.dwt || {};
  dwt.KEYS = KEYS;
})();
