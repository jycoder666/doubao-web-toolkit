// batch-input/module.js — 监听 content-loader 派来的事件, 启动/停止 runner
(function () {
  'use strict';

  let runner = null;

  window.addEventListener('dwt-start-batch', async (e) => {
    const payload = e.detail || {};
    const items = payload.items || [];
    const opts = payload.opts || {};
    if (runner) { try { runner.stop(); } catch (_) {} runner = null; }
    runner = new window.BatchRunner(items, opts);
    runner.onEvent((ev) => {
      try { chrome.runtime.sendMessage({ type: 'BATCH_EVENT', ...ev }); } catch (_) {}
      console.log('[cs][dwt-batch]', ev.state, ev.index + '/' + ev.total);
    });
    await runner.run();
    runner = null;
  });

  window.addEventListener('dwt-stop-batch', () => {
    if (runner) {
      try { runner.stop(); } catch (_) {}
      console.log('[cs][dwt-batch] stopped by user');
    }
  });

  console.log('[cs][doubao-web-toolkit] batch-input module ready');
})();
