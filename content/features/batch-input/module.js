// batch-input module —— 接收 content-loader 发的 START / RESUME 事件，管理 runner 生命周期
import BatchRunner from './runner.js';

let runner = null;

window.addEventListener('dwt-start-batch', async (e) => {
  const payload = e.detail;
  const items = payload?.items || [];
  const opts = payload?.opts || {};
  if (runner) { runner.stop(); runner = null; }
  runner = new BatchRunner(items, opts);
  runner.onEvent((e) => {
    chrome.runtime.sendMessage({ type: 'BATCH_EVENT', ...e });
    console.log('[dwt-batch]', e.state, e.index + '/' + e.total);
  });
  await runner.run();
});

window.addEventListener('dwt-resume-batch', () => {
  // runner 内部会等 chrome.runtime 消息 BATCH_RESUME 放行
});

export default { init() { console.log('[dwt] batch-input module ready'); } };
