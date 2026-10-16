// 内置浏览器打开豆包网页时注入。按 manifest 顺序加载同一批 content scripts。
(function () {
  'use strict';

  if (window.__dwtLiveBoot) return;
  window.__dwtLiveBoot = true;

  var base = 'http://127.0.0.1:5179/';
  var css = [
    'content/styles/common.css',
  ];
  var files = [
    'dev/chrome-mock.js',
    'content/core/selector-manager.js',
    'content/core/dom-observer.js',
    'content/core/reply-state.js',
    'content/core/captcha-detector.js',
    'content/features/batch-input/runner.js',
    'content/features/debug-panel/module.js',
    'content/features/export/module.js',
    'content/features/theme/module.js',
    'content/features/prompt-bar/module.js',
    'content/features/navigator/module.js',
    'content/features/enhance/module.js',
    'content/features/source-inspector/module.js',
    'content/features/input-enhance/module.js',
    'content/features/conversation-manager/module.js',
    'content/features/reading-mark/module.js',
    'content/features/chat-digest/module.js',
    'content/features/batch-input/module.js',
    'content/content-loader.js',
  ];

  function root() {
    return document.head || document.documentElement;
  }

  css.forEach(function (href) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + href;
    root().appendChild(link);
  });

  var index = 0;
  function next() {
    if (index >= files.length) {
      console.log('[cs]', 'doubao page bundle ready', location.href);
      return;
    }
    var script = document.createElement('script');
    script.src = base + files[index++];
    script.onload = next;
    script.onerror = function () {
      console.warn('[cs]', 'bundle file failed', script.src);
      next();
    };
    root().appendChild(script);
  }

  if (root()) next();
  else document.addEventListener('DOMContentLoaded', next);
})();
