(function () {
  'use strict';
  const PANEL_HTML = '<div id="dwt-debug-panel" style="display:none;position:fixed;bottom:12px;right:12px;width:360px;background:#fff;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:12px;z-index:999999;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:#1a1a1a;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b>Doubao Web Toolkit · 调试面板</b><button id="dwt-panel-close" style="border:none;background:transparent;cursor:pointer;font-size:16px;">×</button></div><div style="margin-bottom:8px;"><b>DOM 选择器</b><div id="dwt-selector-table" style="margin-top:4px;"></div></div><div style="margin-bottom:8px;"><b>实时状态</b><div>回复生成中: <span id="dwt-rs">-</span></div><div>验证码: <span id="dwt-cs">-</span></div></div><div><b>操作</b><div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;"><button id="dwt-pick" style="padding:4px 8px;border:1px solid #d0d7de;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">元素选择模式</button></div></div></div><button id="dwt-panel-toggle" style="position:fixed;bottom:12px;right:12px;z-index:999999;padding:6px 10px;background:#2d72de;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;box-shadow:0 2px 8px rgba(45,114,222,.3);">⚙ DWT</button>';
  function renderPanel() {
    const table = document.getElementById('dwt-selector-table');
    if (!table) return;
    table.innerHTML = '';
    const sel = window.dwt?.selectorManager?.DEFAULTS || {};
    Object.entries(sel).forEach(([k, v]) => {
      if (typeof v !== 'string') return;
      const row = document.createElement('div');
      row.style.margin = '3px 0';
      row.innerHTML = '<label style="width:110px;display:inline-block;color:#555;">' + k + '</label><input value="' + v + '" style="width:220px;padding:2px 4px;border:1px solid #d0d7de;border-radius:4px;font-family:Consolas,monospace;font-size:11px;">';
      table.appendChild(row);
    });
  }
  function updateLiveState() {
    const rs = document.getElementById('dwt-rs');
    const cs = document.getElementById('dwt-cs');
    if (rs) rs.textContent = window.dwt?.replyState?.isGenerating() ? '是' : '否';
    if (cs) cs.textContent = window.dwt?.captchaDetector?.isDetected() ? '⚠' : '无';
  }
  function toggle() {
    const p = document.getElementById('dwt-debug-panel'); const b = document.getElementById('dwt-panel-toggle');
    if (!p) return;
    if (p.style.display === 'none') { p.style.display = 'block'; b.style.display = 'none'; renderPanel(); p._t = setInterval(updateLiveState, 1500); }
    else { p.style.display = 'none'; b.style.display = 'block'; if (p._t) clearInterval(p._t); }
  }
  function mount() {
    if (document.getElementById('dwt-debug-panel')) return;
    const wrap = document.createElement('div'); wrap.innerHTML = PANEL_HTML; document.body.appendChild(wrap);
    document.getElementById('dwt-panel-toggle').addEventListener('click', toggle);
    document.getElementById('dwt-panel-close').addEventListener('click', toggle);
    window.addEventListener('dwt-toggle-debug-panel', toggle);
    window.dwt?.captchaDetector?.start?.();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  console.log('[doubao-web-toolkit] debug-panel loaded');
})();
