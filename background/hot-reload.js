// background/hot-reload.js — 开发热重载（零依赖）
//
// 作用：开发时改动源码后，无需手动去 chrome://extensions 点「重新加载」，
//      也无需手动刷新 doubao 页面。本模块会周期性地对扩展自身的源码文件
//      做内容指纹（hash）比对，一旦发现变化即：
//        1) 刷新所有已打开的 doubao / dola 标签页（content script 重新注入）
//        2) 调用 chrome.runtime.reload() 重载扩展本身（background 重新加载）
//
// 原理：MV3 没有「文件变化」事件源，但已解压（unpacked）加载的扩展，
//      其源码就在磁盘上。通过 chrome.runtime.getPackageDirectoryEntry()
//      拿到扩展根目录，逐文件读取内容计算指纹；也支持 fetch(no-store) 兜底。
//
// 安全：仅在「开发模式」下启用（storage 中 dwt_dev_hot_reload === true），
//      默认关闭，避免影响正式使用。
(function () {
  'use strict';

  const LOG = '[bg][dwt-hot-reload]';

  // 需要监听的源码文件（相对扩展根目录）。
  // 覆盖 manifest + background + content + popup + options + lib，
  // 改动任意一个都会触发重载。
  const WATCH_FILES = [
    'manifest.json',
    'background/service-worker.js',
    'background/hot-reload.js',
    'content/content-loader.js',
    'content/styles/common.css',
    'content/core/selector-manager.js',
    'content/core/dom-observer.js',
    'content/core/reply-state.js',
    'content/core/captcha-detector.js',
    'content/features/batch-input/module.js',
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
    'content/features/selection-tools/module.js',
    'content/features/rec-blocker/module.js',
    'content/features/vibe/module.js',
    'content/features/float-panel/module.js',
    'content/features/page-comfort/module.js',
    'content/features/keyword-spark/module.js',
    'content/features/context-lines/module.js',
    'content/features/arxiv-prompt/module.js',
    'lib/db.js',
    'lib/schema.js',
    'popup/popup.html',
    'popup/popup.js',
    'popup/popup.css',
    'options/options.html',
    'options/options.js',
    'options/options.css',
  ];

  const POLL_INTERVAL = 1500; // 轮询间隔（ms），兼顾灵敏度与开销
  const KEEPALIVE_INTERVAL = 20000; // 保活间隔（ms）：< MV3 的 30s 空闲终止阈值

  let timer = null;
  let keepAliveTimer = null;
  let lastHash = '';      // 上一次所有文件的合并指纹
  let reloading = false;  // 防止重载流程重入
  let started = false;

  // 轻量字符串 hash（FNV-1a 变体），用于快速比对文件内容是否变化。
  function hashStr(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  }

  // 读取扩展内某文件的文本内容（取磁盘最新内容，避免命中扩展资源缓存）。
  // 策略：优先用 getPackageDirectoryEntry 直读磁盘文件（最可靠，能感知外部编辑），
  //      失败时回退 fetch(no-store)。
  async function readFileViaEntry(path) {
    if (!chrome.runtime.getPackageDirectoryEntry) return null;
    const root = await new Promise((resolve, reject) => {
      chrome.runtime.getPackageDirectoryEntry((d) => {
        if (d) resolve(d); else reject(new Error('no dir entry'));
      });
    });
    const parts = path.split('/');
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await new Promise((resolve, reject) => {
        dir.getDirectory(parts[i], {}, resolve, reject);
      });
    }
    const fileEntry = await new Promise((resolve, reject) => {
      dir.getFile(parts[parts.length - 1], {}, resolve, reject);
    });
    const file = await new Promise((resolve, reject) => fileEntry.file(resolve, reject));
    return await file.text();
  }

  async function readFileText(path) {
    try {
      const viaEntry = await readFileViaEntry(path);
      if (viaEntry != null) return viaEntry;
    } catch (_) { /* 回退 fetch */ }
    const url = chrome.runtime.getURL(path);
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }

  // 计算全部被监听文件的合并指纹。
  async function computeFingerprint() {
    const parts = [];
    for (const f of WATCH_FILES) {
      try {
        const text = await readFileText(f);
        parts.push(f + ':' + hashStr(text));
      } catch (_) {
        // 文件不存在（如尚未创建）时记为 missing，不影响其它文件比对
        parts.push(f + ':missing');
      }
    }
    return parts.join('|');
  }

  // 刷新所有已打开的 doubao / dola 标签页，使 content script 重新注入。
  async function reloadTargetTabs() {
    try {
      const tabs = await chrome.tabs.query({
        url: ['https://www.doubao.com/*', 'https://www.dola.com/*'],
      });
      for (const t of tabs) {
        if (t.id != null) {
          try { await chrome.tabs.reload(t.id); } catch (_) {}
        }
      }
      return tabs.length;
    } catch (_) {
      return 0;
    }
  }

  // 检测到变化后的处理：先刷新目标标签页，再重载扩展本身。
  async function onChanged() {
    if (reloading) return;
    reloading = true;
    try {
      const n = await reloadTargetTabs();
      console.log(LOG, '源码变化，已刷新标签页', n, '个，即将重载扩展');
      // 给标签页刷新一点时间，再重载扩展
      setTimeout(() => {
        try { chrome.runtime.reload(); } catch (e) { console.warn(LOG, 'reload 失败', e); }
      }, 300);
    } catch (e) {
      console.warn(LOG, 'onChanged 出错', e);
      reloading = false;
    }
  }

  // 单次轮询：比对指纹，变化则触发重载。
  async function tick() {
    try {
      const fp = await computeFingerprint();
      if (lastHash === '') {
        lastHash = fp; // 首次运行只记录基线，不触发
        return;
      }
      if (fp !== lastHash) {
        lastHash = fp;
        await onChanged();
      }
    } catch (e) {
      // 读取失败（如权限变化）时静默，避免刷屏
    }
  }

  function start() {
    if (started) return;
    started = true;
    // 先建立基线，再开始轮询
    computeFingerprint().then((fp) => {
      lastHash = fp;
      timer = setInterval(tick, POLL_INTERVAL);
      console.log(LOG, '已启用，监听', WATCH_FILES.length, '个文件，间隔', POLL_INTERVAL, 'ms');
    }).catch(() => {
      timer = setInterval(tick, POLL_INTERVAL);
    });
    // MV3 service worker 约 30s 空闲即被终止；周期性调用一个 chrome API
    // 可重置空闲计时器，保证轮询不中断。
    if (!keepAliveTimer) {
      keepAliveTimer = setInterval(() => {
        try { chrome.runtime.getPlatformInfo(() => {}); } catch (_) {}
      }, KEEPALIVE_INTERVAL);
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    started = false;
    lastHash = '';
    console.log(LOG, '已停用');
  }

  // 读取开发开关，决定是否启用。
  async function syncFromStorage() {
    try {
      const r = await chrome.storage.local.get('dwt_dev_hot_reload');
      if (r.dwt_dev_hot_reload === true) start();
      else stop();
    } catch (_) {}
  }

  // 监听开关变化，实时启停
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dwt_dev_hot_reload) {
      if (changes.dwt_dev_hot_reload.newValue === true) start();
      else stop();
    }
  });

  // 扩展启动（含重载后）即按开关状态同步
  syncFromStorage();

  // 暴露给 service-worker 以便统一初始化
  self.dwtHotReload = { start, stop, syncFromStorage, isRunning: () => started };
})();
