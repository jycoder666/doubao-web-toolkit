// prompt-bar/module.js — 可配置的 Prompt 片段快捷插入
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const KEY = 'dwt_prompts';

  let prompts = [
    { label: '翻译英文', value: '请翻译成英文' },
    { label: '总结摘要', value: '请为上面的内容写一段 100 字的摘要' },
    { label: '改写优化', value: '请帮我改写这段话,让它更流畅专业' },
    { label: 'JSON 格式', value: '请以严格的 JSON 格式输出,不要包含 markdown 代码块标记' },
  ];

  async function load() {
    try {
      const r = await chrome.storage.local.get(KEY);
      if (r[KEY] && r[KEY].length) prompts = r[KEY];
    } catch (_) {}
  }

  function mount() {
    if (document.getElementById('dwt-prompt-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'dwt-prompt-bar';
    bar.style.cssText = 'position:fixed;bottom:64px;right:12px;z-index:999998;display:flex;gap:4px;flex-wrap:wrap;max-width:360px;font-size:11px;';
    bar.innerHTML = prompts.map((p, i) =>
      '<button data-idx="' + i + '" style="padding:2px 8px;border:1px solid #d0d7de;border-radius:12px;background:#fff;cursor:pointer;font-size:11px;color:#2d72de;">' + p.label + '</button>'
    ).join('');
    document.body.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      const p = prompts[idx];
      if (!p) return;
      const pm = dwt.selectorManager?.getInput?.();
      if (!pm) { alert('输入框未找到'); return; }
      pm.focus();
      const existing = pm.innerText || '';
      pm.innerHTML = '<p dir="auto">' + (existing ? existing + '\n' : '') + p.value + '</p>';
      pm.dispatchEvent(new InputEvent('input', { data: p.value, inputType: 'insertText', bubbles: true }));
      pm.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  dwt.promptBarModule = { mount, load, getPrompts: () => prompts };

  load().then(mount);
  console.log('[cs][doubao-web-toolkit] prompt-bar module ready');
})();
