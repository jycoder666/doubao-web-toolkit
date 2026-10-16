// batch-input/module.js — 监听 content-loader 派来的事件, 启动/停止 runner
(function () {
  'use strict';

  let runner = null;

  async function onStart(e) {
    const payload = e.detail || {};
    const items = payload.items || [];
    const opts = payload.opts || {};
    // 预览 bridge 会广播到所有豆包 tab：只让前台页跑，避免后台页误报状态
    if (document.hidden) {
      console.warn('[cs][dwt-batch] skip START_BATCH: tab hidden', location.href);
      return;
    }
    // 无 ProseMirror 输入框的页面忽略广播（空输入时 send-btn-wrapper 本就会隐藏，不能靠它判断）
    const pm = document.querySelector('.ProseMirror[contenteditable="true"]');
    if (!pm || pm.getBoundingClientRect().width < 40) {
      console.warn('[cs][dwt-batch] skip START_BATCH: no usable ProseMirror on', location.href);
      return;
    }
    if (runner) { try { runner.stop(); } catch (_) {} runner = null; }
    runner = new window.BatchRunner(items, opts);
    runner.onEvent((ev) => {
      try { chrome.runtime.sendMessage({ type: 'BATCH_EVENT', ...ev }); } catch (_) {}
      console.log('[cs][dwt-batch]', ev.state, ev.index + '/' + ev.total);
    });
    await runner.run();
    runner = null;
  }

  function onStop() {
    if (runner) {
      try { runner.stop(); } catch (_) {}
      console.log('[cs][dwt-batch] stopped by user');
    }
  }

  // 热重载时先卸旧 listener，避免 START_BATCH 被处理 N 次
  if (window.__dwtBatchHandlers) {
    window.removeEventListener('dwt-start-batch', window.__dwtBatchHandlers.start);
    window.removeEventListener('dwt-stop-batch', window.__dwtBatchHandlers.stop);
  }
  window.__dwtBatchHandlers = { start: onStart, stop: onStop };
  window.addEventListener('dwt-start-batch', onStart);
  window.addEventListener('dwt-stop-batch', onStop);

  console.log('[cs][doubao-web-toolkit] batch-input module ready');
})();
