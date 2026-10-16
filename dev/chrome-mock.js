// 预览页用的 chrome.* 替身。扩展页面里已有真实 chrome.runtime.id 时什么都不做。
(function () {
  'use strict';

  if (window.__dwtChromeMock) return;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return;

  const STORE_KEY = 'dwt_preview_storage';

  function read() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch (_) { return {}; }
  }

  function write(obj) {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  }

  if (!localStorage.getItem(STORE_KEY)) {
    write({
      dwt_batch_lines: '请帮我写周报\n请总结今天的会议',
      dwt_min_interval: 3,
      dwt_reply_timeout: 180,
      dwt_source_inspector: true,
      dwt_reading_mark: true,
      dwt_enter_swap: true,
      dwt_debug_panel: true,
      dwt_conv_manager: false,
      dwt_chat_digest: false,
      dwt_dev_hot_reload: false,
    });
  }

  const storageListeners = [];
  const runtimeListeners = [];

  function keyList(keys) {
    if (keys == null) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === 'object') return Object.keys(keys);
    return null;
  }

  function getImpl(keys) {
    const all = read();
    const list = keyList(keys);
    if (!list) return Object.assign({}, all);
    const out = {};
    list.forEach((k) => { if (Object.prototype.hasOwnProperty.call(all, k)) out[k] = all[k]; });
    return out;
  }

  function setImpl(items) {
    const all = read();
    const changes = {};
    Object.keys(items || {}).forEach((k) => {
      changes[k] = { oldValue: all[k], newValue: items[k] };
      all[k] = items[k];
    });
    write(all);
    storageListeners.forEach((fn) => { try { fn(changes, 'local'); } catch (_) {} });
  }

  function deliver(msg) {
    runtimeListeners.forEach((fn) => {
      try { fn(msg, { tab: { id: 1 } }, function () {}); } catch (_) {}
    });
  }

  const dwtChrome = {
    storage: {
      local: {
        get(keys, cb) {
          const result = getImpl(keys);
          if (typeof cb === 'function') cb(result);
          return Promise.resolve(result);
        },
        set(items, cb) {
          setImpl(items);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
        remove(keys, cb) {
          const all = read();
          (keyList(keys) || []).forEach((k) => { delete all[k]; });
          write(all);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
      onChanged: {
        addListener(fn) { storageListeners.push(fn); },
        removeListener(fn) {
          const i = storageListeners.indexOf(fn);
          if (i >= 0) storageListeners.splice(i, 1);
        },
      },
    },
    runtime: {
      lastError: null,
      sendMessage(msg, cb) {
        deliver(msg);
        const result = { ok: true, mocked: true };
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      onMessage: {
        addListener(fn) { runtimeListeners.push(fn); },
        removeListener(fn) {
          const i = runtimeListeners.indexOf(fn);
          if (i >= 0) runtimeListeners.splice(i, 1);
        },
      },
      openOptionsPage() {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'dwt-preview-open-options' }, '*');
        }
        return Promise.resolve();
      },
      getURL(path) {
        return '/' + String(path || '').replace(/^\//, '');
      },
    },
    tabs: {
      query(_query, cb) {
        const tabs = window.__DWT_PREVIEW_NO_TAB
          ? []
          : [{ id: 1, active: true, url: 'https://www.doubao.com/chat' }];
        if (typeof cb === 'function') cb(tabs);
        return Promise.resolve(tabs);
      },
      sendMessage(_tabId, msg, cb) {
        deliver(msg);
        const result = { ok: true, mocked: true };
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      reload() { return Promise.resolve(); },
    },
  };

  if (typeof chrome === 'undefined') {
    window.chrome = dwtChrome;
  } else {
    if (!chrome.storage) chrome.storage = dwtChrome.storage;
    if (!chrome.tabs) chrome.tabs = dwtChrome.tabs;
    if (!chrome.runtime) chrome.runtime = dwtChrome.runtime;
  }
  window.__dwtChromeMock = true;
  console.log('[preview]', 'chrome.* mock installed');
})();
