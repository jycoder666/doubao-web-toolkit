// batch-input/module.js — 监听 content-loader 派来的事件, 启动/停止 runner
// v5.16: 与 panel 同轮；重复 START 守卫不变（闪烁/附件态由 panel 内存共享修复）
(function () {
  'use strict';

  let runner = null;
  let lastStartSig = '';
  let lastStartAt = 0;

  async function onStart(e) {
    const payload = e.detail || {};
    const items = payload.items || [];
    const opts = payload.opts || {};
    // 重复启动守卫: bridge 广播 / 重复注入遗留监听器会把同一次 START 派发多次,
    // 旧逻辑「stop 旧的 + 从头新建」会让队列从第 0 条重发 (表现为循环发送)。
    // 1) 1.2s 内相同载荷直接忽略; 2) 运行中/等回复时拒绝新启动。
    const sig = JSON.stringify(items).slice(0, 4000) + '|' + JSON.stringify(opts || {});
    const now = Date.now();
    if (sig === lastStartSig && now - lastStartAt < 1200) {
      console.warn('[cs][dwt-batch] duplicate START_BATCH ignored');
      return;
    }
    lastStartSig = sig;
    lastStartAt = now;
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
    if (runner) {
      const st = runner.state || 'IDLE';
      if (st === 'RUNNING' || st === 'WAITING_REPLY') {
        console.warn('[cs][dwt-batch] runner busy (' + st + '), ignore new start');
        try { window.dispatchEvent(new CustomEvent('dwt-batch-busy')); } catch (_) {}
        return;
      }
      // 旧 runner 已被新运行替换: 先摘掉它的状态写入权, 否则它退出时补发的终态
      // 会盖掉新 runner 的 RUNNING, 面板据此判定「本次运行已结束」而不再同步队列
      try { runner.detached = true; } catch (_) {}
      try { runner.stop(); } catch (_) {}
      runner = null;
    }
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

  function onResume() {
    window.dispatchEvent(new CustomEvent('dwt-batch-resume'));
  }

  // 热重载时先卸旧 listener，避免 START_BATCH 被处理 N 次
  if (window.__dwtBatchHandlers) {
    window.removeEventListener('dwt-start-batch', window.__dwtBatchHandlers.start);
    window.removeEventListener('dwt-stop-batch', window.__dwtBatchHandlers.stop);
  }
  window.__dwtBatchHandlers = { start: onStart, stop: onStop, resume: onResume };
  window.addEventListener('dwt-start-batch', onStart);
  window.addEventListener('dwt-stop-batch', onStop);

  window.dwt = window.dwt || {};
  window.dwt.batchInputModule = {
    getStatus() { return window.__dwtBatchStatus || null; },
    isRunning() {
      const s = window.__dwtBatchStatus;
      return !!(s && s.state && s.state !== 'IDLE' && s.state !== 'DONE' && s.state !== 'STOPPED');
    },
  };

  console.log('[cs][doubao-web-toolkit] batch-input module ready');
})();
