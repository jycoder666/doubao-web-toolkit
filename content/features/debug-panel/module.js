// debug-panel/module.js — doubao.com/chat 页面右下角调试面板浮层
(function () {
  'use strict';

  const PANEL_HTML = `
<div id="dwt-debug-panel" style="display:none;position:fixed;bottom:12px;right:12px;width:360px;background:#fff;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:12px;z-index:999999;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#1a1a1a;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <b>Doubao Web Toolkit · 调试面板</b>
    <button id="dwt-panel-close" style="border:none;background:transparent;cursor:pointer;font-size:16px;">×</button>
  </div>
  <div style="margin-bottom:8px;"><b>DOM 选择器</b><div id="dwt-selector-table" style="margin-top:4px;"></div></div>
  <div style="margin-bottom:8px;"><b>实时状态</b>
    <div>回复生成中: <span id="dwt-rs">-</span></div>
    <div>验证码: <span id="dwt-cs">-</span></div>
  </div>
  <div>
    <b>操作</b>
    <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;">
      <button id="dwt-pick" style="padding:4px 8px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">元素选择模式</button>
      <button id="dwt-save-selectors" style="padding:4px 8px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">保存选择器</button>
    </div>
  </div>
</div>
<button id="dwt-panel-toggle" style="position:fixed;bottom:12px;right:12px;z-index:999999;padding:6px 10px;background:#2d72de;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;box-shadow:0 2px 8px rgba(45,114,222,.3);">⚙ DWT</button>`;

  const DEFAULTS = {
    input: { value: '.ProseMirror', label: '输入框' },
    send:  { value: '特征匹配:disabled=false+svg+top>550+靠右', label: '发送按钮' },
    replyState: { value: '[thinking],[streaming],[loading],[typing]', label: '回复中标识' },
    captcha: { value: '[captcha],[verify],[verifycode]', label: '验证码' },
  };

  let currentSelectors = JSON.parse(JSON.stringify(DEFAULTS));

  function renderPanel() {
    const table = document.getElementById('dwt-selector-table');
    if (!table) return;
    table.innerHTML = '';
    Object.entries(currentSelectors).forEach(([key, val]) => {
      const row = document.createElement('div');
      row.style.margin = '3px 0';
      row.innerHTML = `<label style="width:110px;display:inline-block;color:#555;">${val.label}</label>
        <input data-key="${key}" value="${val.value}" style="width:220px;padding:2px 4px;border:1px solid #d0d7de;border-radius:4px;font-family:Consolas,monospace;font-size:11px;">`;
      table.appendChild(row);
    });
  }

  function updateLiveState() {
    const rs = document.getElementById('dwt-rs');
    const cs = document.getElementById('dwt-cs');
    if (rs) rs.textContent = window.dwt?.replyState?.isGenerating() ? '是' : '否';
    if (cs) cs.textContent = window.dwt?.captchaDetector?.isDetected() ? '⚠ 已检测' : '无';
  }

  function toggle() {
    const panel = document.getElementById('dwt-debug-panel');
    const btn = document.getElementById('dwt-panel-toggle');
    if (!panel) return;
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      btn.style.display = 'none';
      renderPanel();
      panel._timer = setInterval(updateLiveState, 1500);
    } else {
      panel.style.display = 'none';
      btn.style.display = 'block';
      if (panel._timer) clearInterval(panel._timer);
    }
  }

  function startPickMode() {
    document.body.style.cursor = 'crosshair';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000000;background:rgba(255,255,0,0.05);pointer-events:none;';
    document.body.appendChild(overlay);
    const onClick = (e) => {
      e.preventDefault(); e.stopPropagation();
      document.body.style.cursor = ''; overlay.remove();
      document.removeEventListener('click', onClick, true);
      const sel = prompt('请输入此元素的 selector:', e.target.tagName.toLowerCase() + (e.target.className ? '.' + e.target.className.toString().trim().split(/\s+/)[0] : ''));
      if (sel) console.log('[dwt-pick] selector:', sel);
    };
    document.addEventListener('click', onClick, true);
  }

  function mount() {
    if (document.getElementById('dwt-debug-panel')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = PANEL_HTML;
    document.body.appendChild(wrap);

    document.getElementById('dwt-panel-toggle').addEventListener('click', toggle);
    document.getElementById('dwt-panel-close').addEventListener('click', toggle);
    document.getElementById('dwt-pick').addEventListener('click', startPickMode);
    document.getElementById('dwt-save-selectors').addEventListener('click', async () => {
      document.querySelectorAll('#dwt-selector-table input').forEach(inp => {
        currentSelectors[inp.dataset.key].value = inp.value;
      });
      const flat = {};
      Object.entries(currentSelectors).forEach(([k, v]) => flat[k] = v.value);
      try { await chrome.storage.local.set({ dwt_selectors: flat }); } catch (_) {}
      alert('选择器已保存 ✓');
    });

    // 响应 popup "TOGGLE_DEBUG_PANEL"
    window.addEventListener('dwt-toggle-debug-panel', toggle);

    window.dwt.captchaDetector?.start?.();
  }

  // 等 DOM ready 后 mount
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  console.log('[doubao-web-toolkit] debug-panel loaded');
})();
