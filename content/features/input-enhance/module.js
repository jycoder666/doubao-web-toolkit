// input-enhance/module.js — 输入与快捷键增强
// 功能 1: Enter 换行 / Ctrl(⌘)+Enter 发送 —— 拦截输入框 keydown, 改写默认行为
// 功能 2: 模型记忆 —— 记录最近使用的模型名, 下次进入会话自动提示/恢复
// 说明: 纯 DOM 事件层实现; 模型记忆只记录名称, 恢复依赖页面自身的模型选择 UI.
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY_MODEL = 'dwt_last_model';
  const KEY_SWAP = 'dwt_enter_swap';

  let swapEnabled = true;   // true: Enter 换行, Ctrl+Enter 发送
  let boundInput = null;
  let lastModel = '';

  // ---------- 功能 1: Enter 换行 / Ctrl+Enter 发送 ----------

  function getInput() {
    return dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
  }

  // 触发发送: 优先点击发送按钮 (豆包 Enter 默认为换行, 必须点按钮或 Ctrl+Enter)
  async function triggerSend() {
    try {
      const btn = await dwt.selectorManager.waitForSend(3000);
      btn.click();
    } catch (_) {
      // 兜底: 派发 Ctrl+Enter 键盘事件
      const pm = getInput();
      if (pm) {
        pm.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', ctrlKey: true, metaKey: true, bubbles: true,
        }));
      }
    }
  }

  function onKeydown(e) {
    if (!swapEnabled) return;
    if (e.key !== 'Enter') return;
    const isSend = e.ctrlKey || e.metaKey;
    if (isSend) {
      // Ctrl/⌘ + Enter → 发送
      e.preventDefault();
      e.stopPropagation();
      triggerSend();
    } else {
      // 单独 Enter → 换行 (交给浏览器默认行为即可, 仅确保不误发)
      // 豆包默认 Enter 就是换行, 这里无需干预
    }
  }

  function bindInput() {
    const pm = getInput();
    if (!pm || pm === boundInput) return;
    if (boundInput) boundInput.removeEventListener('keydown', onKeydown, true);
    boundInput = pm;
    boundInput.addEventListener('keydown', onKeydown, true);
    console.log('[dwt-input-enhance] bound keydown on input');
  }

  // ---------- 功能 2: 模型记忆 ----------

  // 从页面 DOM 猜测当前模型名 (豆包模型选择器通常是一个带模型名的按钮)
  function detectCurrentModel() {
    const candidates = document.querySelectorAll('button, [role="button"], [class*="model"]');
    for (const el of candidates) {
      const t = (el.innerText || '').trim();
      // 常见模型关键词
      if (/^(豆包|Doubao|Skylark|云雀|Seed|深度思考|联网)/i.test(t) && t.length <= 20) {
        return t;
      }
    }
    return '';
  }

  async function loadModel() {
    try {
      const r = await chrome.storage.local.get(KEY_MODEL);
      lastModel = r[KEY_MODEL] || '';
    } catch (_) { lastModel = ''; }
  }

  async function saveModel(name) {
    if (!name || name === lastModel) return;
    lastModel = name;
    try { await chrome.storage.local.set({ [KEY_MODEL]: name }); } catch (_) {}
  }

  // 定时采样当前模型名并记录
  function watchModel() {
    setInterval(() => {
      const m = detectCurrentModel();
      if (m) saveModel(m);
    }, 5000);
  }

  // ---------- 配置加载 ----------

  async function loadConfig() {
    try {
      const r = await chrome.storage.local.get([KEY_SWAP]);
      swapEnabled = r[KEY_SWAP] !== false; // 默认开启
    } catch (_) { swapEnabled = true; }
  }

  function mount() {
    bindInput();
    // 输入框是 React 动态渲染的, 定时重绑 (幂等)
    setInterval(bindInput, 3000);
    watchModel();
    console.log('[dwt-input-enhance] mounted');
  }

  dwt.inputEnhanceModule = {
    mount,
    setSwap(v) { swapEnabled = !!v; },
    isSwap: () => swapEnabled,
    detectCurrentModel,
    getLastModel: () => lastModel,
  };

  loadConfig().then(mount);

  console.log('[doubao-web-toolkit] input-enhance module ready');
})();
