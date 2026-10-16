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
      // runner.js 内部直接监听 chrome.runtime.onMessage, 这里只需 sendResponse
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

  // 根据 storage key 分发到对应模块
  function applyFeatureToggle(key, value) {
    const map = {
      dwt_source_inspector: () => window.dwt?.sourceInspectorModule?.setEnabled?.(value),
      dwt_enter_swap: () => window.dwt?.inputEnhanceModule?.setSwap?.(value),
      dwt_conv_manager: () => window.dwt?.convManagerModule?.setEnabled?.(value),
      dwt_reading_mark: () => window.dwt?.readingMarkModule?.setEnabled?.(value),
      dwt_chat_digest: () => window.dwt?.chatDigestModule?.setEnabled?.(value),
      dwt_selection_tools: () => window.dwt?.selectionToolsModule?.setEnabled?.(value),
      dwt_rec_blocker: () => window.dwt?.recBlockerModule?.setEnabled?.(value),
      dwt_vibe: () => window.dwt?.vibeModule?.setEnabled?.(value),
      dwt_float_panel: () => window.dwt?.floatPanelModule?.setEnabled?.(value),
      dwt_page_comfort: () => window.dwt?.pageComfortModule?.setEnabled?.(value),
      dwt_keyword_spark: () => window.dwt?.keywordSparkModule?.setEnabled?.(value),
      dwt_context_lines: () => window.dwt?.contextLinesModule?.setEnabled?.(value),
      dwt_arxiv_prompt: () => window.dwt?.arxivPromptModule?.setEnabled?.(value),
      dwt_debug_panel: () => {
        // 调试面板由 TOGGLE_DEBUG_PANEL 控制, 这里只记录状态
      },
    };
    try { map[key]?.(); } catch (e) { console.warn(LOG, 'applyFeatureToggle failed', key, e); }
  }
})();
