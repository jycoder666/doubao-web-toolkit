// 预览页用的 chrome.* 替身。扩展页面里已有真实 chrome.runtime.id 时什么都不做。
// preview popup ↔ 豆包 live-boot 经 127.0.0.1:5179 /dev/bridge/* HTTP 总线通信
// （BroadcastChannel / 第三方 iframe storage 事件会被顶级站点隔离，故不用）
(function () {
  'use strict';

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return;

  var PREVIEW_ORIGIN = 'http://127.0.0.1:5179';
  var BUS_URL = PREVIEW_ORIGIN + '/dev/bridge/bus';
  var STORE_URL = PREVIEW_ORIGIN + '/dev/bridge/storage';
  var CLIENT_ID = 'dwt-' + Math.random().toString(36).slice(2);

  var state = window.__dwtMockState || (window.__dwtMockState = {
    storageListeners: [],
    runtimeListeners: [],
    lastBusId: 0,
    polling: false,
  });

  var storageListeners = state.storageListeners;
  var runtimeListeners = state.runtimeListeners;

  function keyList(keys) {
    if (keys == null) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === 'object') return Object.keys(keys);
    return null;
  }

  function pickKeys(all, keys) {
    var list = keyList(keys);
    if (!list) return Object.assign({}, all);
    var out = {};
    list.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(all, k)) out[k] = all[k];
    });
    return out;
  }

  function deliver(msg) {
    runtimeListeners.slice().forEach(function (fn) {
      try { fn(msg, { tab: { id: 1 } }, function () {}); } catch (_) {}
    });
  }

  function fireStorage(changes) {
    if (!changes || !Object.keys(changes).length) return;
    storageListeners.slice().forEach(function (fn) {
      try { fn(changes, 'local'); } catch (_) {}
    });
  }

  function handlePacket(pkt) {
    if (!pkt || pkt.from === CLIENT_ID) return;
    if (pkt.channel === 'msg') {
      deliver(pkt.msg);
      return;
    }
    if (pkt.channel === 'storage-changed') {
      fireStorage(pkt.changes || {});
    }
  }

  function publish(pkt) {
    pkt.v = 1;
    pkt.from = CLIENT_ID;
    fetch(BUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pkt: pkt }),
    }).catch(function () {});
  }

  function pollBus() {
    if (state.polling) return;
    state.polling = true;

    function loop() {
      var url = BUS_URL + '?after=' + state.lastBusId + '&wait=20000';
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          (data.items || []).forEach(function (item) {
            if (item.id > state.lastBusId) state.lastBusId = item.id;
            handlePacket(item.pkt);
          });
          loop();
        })
        .catch(function () {
          setTimeout(loop, 1000);
        });
    }

    // 首次只对齐游标, 不回放历史 START_BATCH（避免刷新/晚注入后幽灵跑批）
    fetch(BUS_URL + '?after=' + state.lastBusId + '&wait=0')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        (data.items || []).forEach(function (item) {
          if (item.id > state.lastBusId) state.lastBusId = item.id;
        });
        loop();
      })
      .catch(function () {
        setTimeout(loop, 1000);
      });
  }

  function getAll() {
    return fetch(STORE_URL)
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.value || {}; })
      .catch(function () { return {}; });
  }

  function setItems(items) {
    return fetch(STORE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items || {} }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.changes) {
          fireStorage(d.changes);
          publish({ channel: 'storage-changed', changes: d.changes });
        }
      })
      .catch(function () {});
  }

  function removeKeys(keys) {
    var list = keyList(keys) || [];
    return fetch(STORE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove: list }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.changes) {
          fireStorage(d.changes);
          publish({ channel: 'storage-changed', changes: d.changes });
        }
      })
      .catch(function () {});
  }

  // 若浏览器里还留着旧 localStorage 配置，启动时合并进服务端（只补缺失 key）
  (function migrateLocal() {
    try {
      var raw = localStorage.getItem('dwt_preview_storage');
      if (!raw) return;
      var local = JSON.parse(raw);
      if (!local || typeof local !== 'object') return;
      getAll().then(function (remote) {
        var patch = {};
        Object.keys(local).forEach(function (k) {
          if (remote[k] === undefined) patch[k] = local[k];
        });
        if (Object.keys(patch).length) setItems(patch);
      });
    } catch (_) {}
  })();

  pollBus();

  var dwtChrome = {
    storage: {
      local: {
        get: function (keys, cb) {
          var p = getAll().then(function (all) { return pickKeys(all, keys); });
          if (typeof cb === 'function') p.then(cb);
          return p;
        },
        set: function (items, cb) {
          var p = setItems(items);
          if (typeof cb === 'function') p.then(function () { cb(); });
          return p;
        },
        remove: function (keys, cb) {
          var p = removeKeys(keys);
          if (typeof cb === 'function') p.then(function () { cb(); });
          return p;
        },
      },
      onChanged: {
        addListener: function (fn) { storageListeners.push(fn); },
        removeListener: function (fn) {
          var i = storageListeners.indexOf(fn);
          if (i >= 0) storageListeners.splice(i, 1);
        },
      },
    },
    runtime: {
      lastError: null,
      sendMessage: function (msg, cb) {
        deliver(msg);
        publish({ channel: 'msg', msg: msg });
        var result = { ok: true, mocked: true };
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      onMessage: {
        addListener: function (fn) { runtimeListeners.push(fn); },
        removeListener: function (fn) {
          var i = runtimeListeners.indexOf(fn);
          if (i >= 0) runtimeListeners.splice(i, 1);
        },
      },
      openOptionsPage: function () {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'dwt-preview-open-options' }, '*');
        }
        return Promise.resolve();
      },
      getURL: function (path) {
        return '/' + String(path || '').replace(/^\//, '');
      },
    },
    tabs: {
      query: function (_query, cb) {
        var tabs = window.__DWT_PREVIEW_NO_TAB
          ? []
          : [{ id: 1, active: true, url: 'https://www.doubao.com/chat' }];
        if (typeof cb === 'function') cb(tabs);
        return Promise.resolve(tabs);
      },
      sendMessage: function (_tabId, msg, cb) {
        deliver(msg);
        publish({ channel: 'msg', msg: msg });
        var result = { ok: true, mocked: true };
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      reload: function () { return Promise.resolve(); },
    },
  };

  if (typeof chrome === 'undefined') {
    window.chrome = dwtChrome;
  } else {
    chrome.storage = dwtChrome.storage;
    chrome.tabs = dwtChrome.tabs;
    chrome.runtime = chrome.runtime || {};
    chrome.runtime.lastError = null;
    chrome.runtime.sendMessage = dwtChrome.runtime.sendMessage;
    chrome.runtime.onMessage = dwtChrome.runtime.onMessage;
    chrome.runtime.openOptionsPage = dwtChrome.runtime.openOptionsPage;
    chrome.runtime.getURL = dwtChrome.runtime.getURL;
  }

  window.__dwtChromeMock = true;
  window.__dwtBridgeClientId = CLIENT_ID;
  console.log('[preview]', 'chrome.* mock installed (http-bridge)', CLIENT_ID);
})();
