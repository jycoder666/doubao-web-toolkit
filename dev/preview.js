(function () {
  'use strict';

  const LONG = '这是一段故意放长的状态文案，用来检查 280px 弹窗里按钮、提示和状态行会不会撑破换行，以及滚动条会不会叠成两层。';
  const VIEWS = {
    popup: { src: '/popup/popup.html', frame: 'popup' },
    wide: { src: '/popup/popup.html', frame: 'wide' },
    options: { src: '/options/options.html', frame: 'options' },
    overlay: { src: '/dev/fixture.html', frame: 'overlay' },
  };

  const viewEl = document.getElementById('view');
  const themeEl = document.getElementById('theme');
  const stateEl = document.getElementById('state');
  const hostEl = document.getElementById('host');
  const outlineBtn = document.getElementById('outline');
  const metricsBtn = document.getElementById('metrics-toggle');
  const stage = document.getElementById('stage');
  const frame = document.getElementById('frame');
  const surface = document.getElementById('surface');
  const overlay = document.getElementById('overlay');
  const metrics = document.getElementById('metrics');
  const copyBtn = document.getElementById('copy');
  const copyNote = document.getElementById('copy-note');

  let outlineOn = false;
  let version = 'dev';
  let lastText = '';

  fetch('/manifest.json')
    .then((r) => r.json())
    .then((m) => { version = m.version || 'dev'; })
    .catch(() => {});

  function params() {
    return new URLSearchParams(location.search);
  }

  function readQuery() {
    const q = params();
    if (q.get('view') && VIEWS[q.get('view')]) viewEl.value = q.get('view');
    if (q.get('theme') === 'dark' || q.get('theme') === 'light') themeEl.value = q.get('theme');
    if (q.get('state')) stateEl.value = q.get('state');
    if (q.get('host')) hostEl.value = q.get('host');
    if (q.get('extDebug') === '0') setMetrics(false);
    outlineOn = q.get('outline') === '1';
  }

  function writeQuery() {
    const q = new URLSearchParams();
    q.set('view', viewEl.value);
    q.set('theme', themeEl.value);
    q.set('state', stateEl.value);
    q.set('host', hostEl.value);
    if (!overlay.hidden) q.set('extDebug', '1');
    if (outlineOn) q.set('outline', '1');
    history.replaceState(null, '', location.pathname + '?' + q.toString());
  }

  function setMetrics(on) {
    overlay.hidden = !on;
    metricsBtn.classList.toggle('on', on);
  }

  function applyHost() {
    stage.classList.remove('host-white', 'host-gray', 'host-dirty');
    stage.classList.add('host-' + hostEl.value);
  }

  function applyFrame() {
    const spec = VIEWS[viewEl.value];
    frame.className = 'frame ' + spec.frame;
    if (surface.getAttribute('src') !== spec.src) surface.src = spec.src;
    else applyInside();
  }

  function applyInside() {
    const win = surface.contentWindow;
    const doc = surface.contentDocument;
    if (!win || !doc || !doc.documentElement) return;

    doc.documentElement.classList.toggle('dwt-theme-dark', themeEl.value === 'dark');
    doc.documentElement.classList.toggle('dwt-host-dirty', hostEl.value === 'dirty');
    doc.documentElement.classList.toggle('dwt-outline', outlineOn);
    outlineBtn.classList.toggle('on', outlineOn);

    const state = stateEl.value;
    win.__DWT_PREVIEW_NO_TAB = state === 'error';
    paintState(doc, state);
    measure();
  }

  function paintState(doc, state) {
    const status = doc.getElementById('status');
    const batch = doc.getElementById('batch-status');
    const msg = doc.getElementById('msg');
    const banner = doc.getElementById('dwt-fixture-banner');
    const json = doc.getElementById('batch-json');
    const lines = doc.getElementById('batch-lines');

    if (json && lines && (state === 'empty' || state === 'long') && json.dataset.previewBackup == null) {
      json.dataset.previewBackup = json.value;
      lines.dataset.previewBackup = lines.value;
    }

    if (status) {
      status.style.color = '';
      if (state === 'loading') status.textContent = '加载中…';
      else if (state === 'error') {
        status.textContent = '请先打开 doubao.com 页面';
        status.style.color = '#cf222e';
      } else if (state === 'empty') status.textContent = '配置为空, 请先在选项页填入 JSON 或逐行文本';
      else if (state === 'long') status.textContent = LONG;
      else status.textContent = '';
    }
    if (batch) {
      if (state === 'loading') batch.textContent = '批量发送中: 0/2';
      else if (state === 'empty') batch.textContent = '未启动 · 无待发送条目';
      else if (state === 'error') batch.textContent = '已停止';
      else if (state === 'long') batch.textContent = LONG;
      else batch.textContent = '未启动';
    }
    if (msg) {
      msg.style.color = '';
      if (state === 'loading') msg.textContent = '正在读取配置…';
      else if (state === 'error') {
        msg.textContent = '保存失败：预览存储不可用';
        msg.style.color = '#cf222e';
      } else if (state === 'empty') msg.textContent = '没有可保存的批量模板';
      else if (state === 'long') msg.textContent = LONG;
      else msg.textContent = '';
    }
    if (json && lines) {
      if (state === 'empty') {
        json.value = '';
        lines.value = '';
      } else if (state === 'long') {
        json.value = JSON.stringify([{ text: LONG }], null, 2);
        lines.value = LONG;
      } else if (json.dataset.previewBackup != null) {
        json.value = json.dataset.previewBackup;
        lines.value = lines.dataset.previewBackup || '';
        delete json.dataset.previewBackup;
        delete lines.dataset.previewBackup;
      }
    }
    if (banner) {
      if (state === 'loading') banner.textContent = '加载中… 正在等待回复容器';
      else if (state === 'empty') banner.textContent = '空数据：当前靶页没有新的待发送条目';
      else if (state === 'error') {
        banner.textContent = '错误：选择器未命中输入框（这是预览态文案）';
        banner.style.color = '#cf222e';
      } else if (state === 'long') banner.textContent = LONG;
      else {
        banner.textContent = '本地靶页：注入的是仓库里的 content scripts，不是第二套 UI。';
        banner.style.color = '';
      }
    }
  }

  function pickTarget(doc) {
    const panel = doc.getElementById('dwt-debug-panel');
    if (panel && panel.style.display !== 'none' && panel.getClientRects().length) return panel;
    const wrap = doc.querySelector('.wrap');
    if (wrap) return wrap;
    const toggle = doc.getElementById('dwt-panel-toggle');
    if (toggle) return toggle;
    return doc.body;
  }

  function num(n) {
    return Math.round(n);
  }

  function measure() {
    const doc = surface.contentDocument;
    const win = surface.contentWindow;
    if (!doc || !win || !doc.body) {
      metrics.textContent = '等待页面…';
      return;
    }
    const el = pickTarget(doc);
    const rect = el.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    const root = win.getComputedStyle(doc.documentElement);
    const entry = viewEl.value === 'overlay' ? 'content' : (viewEl.value === 'options' ? 'options' : 'popup');
    const width = frame.getBoundingClientRect().width;
    lastText = [
      '入口: ' + entry,
      '页面: ' + (viewEl.value === 'overlay' ? 'fixture' : 'preview'),
      '构建: v' + version,
      '目标: ' + (el.id ? '#' + el.id : el.className || el.tagName),
      'panel rect: x=' + num(rect.x) + ' y=' + num(rect.y) + ' w=' + num(rect.width) + ' h=' + num(rect.height),
      'font: ' + cs.fontSize + ' / line-height ' + cs.lineHeight,
      'z-index: ' + cs.zIndex + ' / position ' + cs.position,
      'token: gap ' + root.getPropertyValue('--ext-gap').trim()
        + ' / radius ' + root.getPropertyValue('--ext-radius').trim()
        + ' / font ' + root.getPropertyValue('--ext-font').trim()
        + ' / panel ' + root.getPropertyValue('--ext-panel-width').trim(),
      '主题: ' + themeEl.value + ' / 宿主: ' + hostEl.value + ' / 状态: ' + stateEl.value,
      '断点: ' + (width < 400 ? '窄' : '宽') + ' (' + num(width) + 'px)',
    ].join('\n');
    metrics.textContent = lastText;
  }

  surface.addEventListener('load', () => {
    applyInside();
    setTimeout(applyInside, 150);
  });
  viewEl.addEventListener('change', () => { applyFrame(); writeQuery(); });
  themeEl.addEventListener('change', () => { applyInside(); writeQuery(); });
  stateEl.addEventListener('change', () => { applyInside(); writeQuery(); });
  hostEl.addEventListener('change', () => { applyHost(); applyInside(); writeQuery(); });
  outlineBtn.addEventListener('click', () => {
    outlineOn = !outlineOn;
    applyInside();
    writeQuery();
  });
  metricsBtn.addEventListener('click', () => {
    setMetrics(overlay.hidden);
    writeQuery();
    if (!overlay.hidden) measure();
  });

  // 标题栏拖拽，避免挡住选项页表单
  (function enableOverlayDrag() {
    const handle = document.getElementById('overlay-drag') || overlay.querySelector('h2');
    if (!handle) return;
    let dragging = false;
    let ox = 0;
    let oy = 0;
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      dragging = true;
      overlay.classList.add('dragging');
      const rect = overlay.getBoundingClientRect();
      ox = ev.clientX - rect.left;
      oy = ev.clientY - rect.top;
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.bottom = 'auto';
      overlay.style.right = 'auto';
      try { handle.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      ev.preventDefault();
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const maxX = Math.max(0, window.innerWidth - overlay.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - overlay.offsetHeight);
      const x = Math.min(maxX, Math.max(0, ev.clientX - ox));
      const y = Math.min(maxY, Math.max(0, ev.clientY - oy));
      overlay.style.left = x + 'px';
      overlay.style.top = y + 'px';
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      overlay.classList.remove('dragging');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  })();

  copyBtn.addEventListener('click', async () => {
    const pack = [
      '## UI 反馈',
      '- 入口：' + (viewEl.value === 'overlay' ? 'content' : viewEl.value === 'options' ? 'options' : 'popup'),
      '- 页面：' + (viewEl.value === 'overlay' ? 'fixture' : 'preview'),
      '- 预期：',
      '- 实际：',
      '- 度量：',
      lastText.split('\n').map((line) => '  - ' + line).join('\n'),
      '- 截图：',
      '- 复现：',
      '- 范围：只改对应组件 / 不要动消息协议',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(pack);
      copyNote.textContent = '已复制';
    } catch (_) {
      copyNote.textContent = '复制失败';
    }
    setTimeout(() => { copyNote.textContent = ''; }, 1200);
  });

  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'dwt-preview-open-options') {
      viewEl.value = 'options';
      applyFrame();
      writeQuery();
    }
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.altKey && (ev.key === 'd' || ev.key === 'D') && ev.target.tagName !== 'INPUT') {
      setMetrics(overlay.hidden);
      writeQuery();
    }
  });

  readQuery();
  if (params().get('extDebug') === '1') setMetrics(true);
  applyHost();
  applyFrame();
  writeQuery();
  setInterval(() => { if (!overlay.hidden) measure(); }, 500);
})();
