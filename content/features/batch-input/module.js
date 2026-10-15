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
      console.log('[dwt-batch]', ev.state, ev.index + '/' + ev.total);
    });
    await runner.run();
  });
})();
