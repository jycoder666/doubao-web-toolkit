// content-loader.js — 入口脚本
// MV3 content script 不支持 ES Module, 所以 manifest 按依赖顺序列出所有 JS
// 这里只做: 打印 log + 响应 popup 消息 + 功能开关路由
(function () {
  'use strict';

  const LOG = '[cs][doubao-web-toolkit]';
  // 热重载防叠：卸掉旧 listener 再挂新的
  if (window.__dwtContentLoaderHandler) {
    try { chrome.runtime.onMessage.removeListener(window.__dwtContentLoaderHandler); } catch (_) {}
  }
  if (window.__dwtContentLoaderStorageHandler) {
    try { chrome.storage.onChanged.removeListener(window.__dwtContentLoaderStorageHandler); } catch (_) {}
  }
  console.log(LOG, 'loaded on', location.href);

  // 从 storage 读功能开关 (默认都开)
  chrome.storage.local.get('dwt_features').then((r) => {
    const enabled = r.dwt_features || { debugPanel: true, batchInput: true };
    console.log(LOG, 'features:', enabled);
  }).catch(() => {});

  // 响应 popup 的消息
  function onRuntimeMessage(msg, _sender, sendResponse) {
    if (!msg) return;
    if (msg.type === 'TOGGLE_DEBUG_PANEL') {
      window.dispatchEvent(new CustomEvent('dwt-toggle-debug-panel'));
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'START_BATCH') {
      // 优先走可热替换的 handler，避免重复注入后旧 CustomEvent listener 叠跑
      if (window.__dwtBatchHandlers && typeof window.__dwtBatchHandlers.start === 'function') {
        window.__dwtBatchHandlers.start({ detail: msg.payload });
      } else {
        window.dispatchEvent(new CustomEvent('dwt-start-batch', { detail: msg.payload }));
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'STOP_BATCH') {
      if (window.__dwtBatchHandlers && typeof window.__dwtBatchHandlers.stop === 'function') {
        window.__dwtBatchHandlers.stop();
      } else {
        window.dispatchEvent(new CustomEvent('dwt-stop-batch'));
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'BATCH_RESUME') {
      // runner 同时听 runtime + CustomEvent（Glass/chrome-mock 更稳）
      window.dispatchEvent(new CustomEvent('dwt-batch-resume'));
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'EXPORT_CHAT') {
      window.dispatchEvent(new CustomEvent('dwt-export-chat', { detail: msg.payload }));
      sendResponse({ ok: true });
      return true;
    }
    // 功能开关切换: 立即通知对应模块生效 (无需刷新页面)
    if (msg.type === 'TOGGLE_FEATURE') {
      const { key, value } = msg.payload || {};
      applyFeatureToggle(key, value);
      sendResponse({ ok: true });
      return true;
    }
    // 立即扫描联网来源
    if (msg.type === 'SCAN_SOURCE') {
      window.dwt?.sourceInspectorModule?.annotate?.();
      sendResponse({ ok: true });
      return true;
    }
    return true;
  }
  window.__dwtContentLoaderHandler = onRuntimeMessage;
  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  // 功能关时顺带卸 rail（防 ui-rail boot 从 __dwtRailDefs 把旧入口复活）
  const RAIL_BY_FEAT = {
    dwt_selection_tools: 'snip',
    dwt_vibe: 'vibe',
    dwt_float_panel: 'float',
    dwt_keyword_spark: 'spark',
    dwt_arxiv_prompt: 'arxiv',
  };

  // 根据 storage key 分发到对应模块
  function applyFeatureToggle(key, value) {
    const map = {
      dwt_source_inspector: () => window.dwt?.sourceInspectorModule?.setEnabled?.(value),
      dwt_enter_swap: () => window.dwt?.inputEnhanceModule?.setSwap?.(value),
      dwt_conv_manager: () => window.dwt?.convManagerModule?.setEnabled?.(value),
      dwt_reading_mark: () => window.dwt?.readingMarkModule?.setEnabled?.(value),
      dwt_chat_digest: () => window.dwt?.chatDigestModule?.setEnabled?.(value),
      dwt_outline: () => window.dwt?.replyOutlineModule?.setEnabled?.(value),
      dwt_selection_tools: () => window.dwt?.selectionToolsModule?.setEnabled?.(value),
      dwt_rec_blocker: () => window.dwt?.recBlockerModule?.setEnabled?.(value),
      dwt_vibe: () => window.dwt?.vibeModule?.setEnabled?.(value),
      dwt_float_panel: () => window.dwt?.floatPanelModule?.setEnabled?.(value),
      dwt_page_comfort: () => window.dwt?.pageComfortModule?.setEnabled?.(value),
      dwt_keyword_spark: () => window.dwt?.keywordSparkModule?.setEnabled?.(value),
      dwt_context_lines: () => window.dwt?.contextLinesModule?.setEnabled?.(value),
      dwt_arxiv_prompt: () => window.dwt?.arxivPromptModule?.setEnabled?.(value),
      dwt_debug_panel: () => {
        // ⚙ 现为配置入口，始终保留；此键只影响调试面板能力本身
      },
    };
    try { map[key]?.(); } catch (e) { console.warn(LOG, 'applyFeatureToggle failed', key, e); }
    if (!value && RAIL_BY_FEAT[key]) {
      try { window.dwt?.rail?.remove?.(RAIL_BY_FEAT[key]); } catch (_) {}
    }
  }

  // 配置页 / Glass storage 桥落盘后：立刻同步到各模块（以前只靠 TOGGLE_FEATURE 消息，保存无感）
  const FEATURE_KEYS = [
    'dwt_source_inspector', 'dwt_enter_swap', 'dwt_conv_manager', 'dwt_reading_mark',
    'dwt_chat_digest', 'dwt_outline', 'dwt_selection_tools', 'dwt_rec_blocker',
    'dwt_vibe', 'dwt_float_panel', 'dwt_page_comfort', 'dwt_keyword_spark',
    'dwt_context_lines', 'dwt_arxiv_prompt', 'dwt_debug_panel',
  ];
  // 默认关的键：storage 缺省时按 false 分发，避免「关了却还在 rail」
  const DEFAULT_OFF = {
    dwt_conv_manager: true,
    dwt_chat_digest: true,
    dwt_vibe: true,
    dwt_float_panel: true,
    dwt_page_comfort: true,
    dwt_keyword_spark: true,
    dwt_context_lines: true,
    dwt_arxiv_prompt: true,
  };

  function valueOrDefault(key, raw) {
    if (raw === undefined) return !DEFAULT_OFF[key];
    return raw === true;
  }

  function syncAllFeatures(bag) {
    FEATURE_KEYS.forEach((key) => {
      applyFeatureToggle(key, valueOrDefault(key, bag && bag[key]));
    });
  }

  function onStorageChanged(changes, area) {
    if (area && area !== 'local') return;
    if (!changes) return;
    let touched = false;
    const bag = {};
    FEATURE_KEYS.forEach((key) => {
      if (changes[key]) {
        touched = true;
        bag[key] = changes[key].newValue;
      }
    });
    if (!touched) return;
    // 只改动的键也要带默认语义
    FEATURE_KEYS.forEach((key) => {
      if (changes[key]) applyFeatureToggle(key, valueOrDefault(key, changes[key].newValue));
    });
  }
  window.__dwtContentLoaderStorageHandler = onStorageChanged;
  try { chrome.storage.onChanged.addListener(onStorageChanged); } catch (_) {}

  // 启动后同步：立刻一次 + 稍后两次（等 module / ui-rail boot 补 defs）
  function bootSync() {
    chrome.storage.local.get(FEATURE_KEYS).then((r) => {
      syncAllFeatures(r || {});
    }).catch(() => {});
  }
  bootSync();
  setTimeout(bootSync, 400);
  setTimeout(bootSync, 1500);
  // selection-tools hotReload 的 storage 读可能晚于 1.5s；再扫一次堵住语料板回潮
  setTimeout(bootSync, 2800);
})();
