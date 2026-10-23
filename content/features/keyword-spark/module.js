// keyword-spark/module.js — 视觉检索关键词（#56 PinSpark 本地精简）
// 中文主题 → Pinterest / Behance / 花瓣检索词，只在本地拼接，不请求外站。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_keyword_spark';
  const ROOT_ID = 'dwt-spark-root';
  const STYLE_ID = 'dwt-spark-style';

  let enabled = false;

  // ⓘ 用法说明：面板标题右侧与 rail 菜单行标题右侧共用同一份
  const HELP = {
    title: '✨ 视觉关键词',
    desc: '把中文主题翻成设计站「真能搜到东西」的检索词，纯本地拼接。',
    rows: [
      ['怎么用', '输入中文主题 → 生成：Pinterest / Behance / 花瓣 各出 3 个关键词'],
      ['点关键词', '复制到剪贴板（不打开外站、不替你搜索）'],
      ['开关', '右侧工具栏 ✨ 亮起 = 面板已打开，再点一次收起'],
      ['挪位置', '按住标题「视觉关键词」拖动'],
    ],
    note: '不联网、不读会话内容：关键词 = 主题 + 各站惯用后缀（aesthetic / moodboard / 配色…）。搜出来好不好，取决于主题词本身。',
  };

  function sparks(theme) {
    const t = theme.trim();
    if (!t) return [];
    return [
      { site: 'Pinterest', words: [t + ' aesthetic', t + ' moodboard', t + ' color palette'] },
      { site: 'Behance', words: [t + ' branding', t + ' poster design', t + ' UI concept'] },
      { site: '花瓣', words: [t + ' 配色', t + ' 海报', t + ' 灵感板'] },
    ];
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${ROOT_ID} {
        position: fixed; right: 12px; bottom: 56px; z-index: 999990;
        width: 280px; background: var(--dwt-bg, #fff); border: 1px solid var(--dwt-border, #d0d7de); border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.14); font-family: system-ui, sans-serif;
        color: var(--dwt-fg, #1f2328); font-size: 12px; padding: 10px;
      }
      #${ROOT_ID} h3 { margin: 0 0 6px; font-size: 13px; }
      #${ROOT_ID} .row { display: flex; gap: 6px; }
      #${ROOT_ID} input { flex: 1; border: 1px solid var(--dwt-border, #d0d7de); border-radius: 6px; padding: 4px 6px; background: var(--dwt-soft, #f6f8fa); color: inherit; }
      #${ROOT_ID} button { border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa); border-radius: 6px; cursor: pointer; color: inherit; }
      #${ROOT_ID} .site { margin-top: 8px; font-weight: 600; }
      #${ROOT_ID} .chip {
        display: inline-block; margin: 4px 4px 0 0; padding: 2px 6px; border-radius: 999px;
        background: var(--dwt-chip-bg, #ddf4ff); color: var(--dwt-fg, #1f2328); cursor: pointer;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function renderList(box, theme) {
    box.innerHTML = '';
    sparks(theme).forEach((group) => {
      const h = document.createElement('div');
      h.className = 'site';
      h.textContent = group.site;
      box.appendChild(h);
      group.words.forEach((w) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = w;
        chip.title = '点击复制';
        chip.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(w); chip.textContent = '已复制'; }
          catch (_) { chip.textContent = w; }
          setTimeout(() => { chip.textContent = w; }, 800);
        });
        box.appendChild(chip);
      });
    });
  }

  function mount() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      injectStyles();
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = '<h3>视觉关键词</h3><div class="row"><input id="dwt-spark-in" placeholder="输入中文主题"><button type="button" id="dwt-spark-go">生成</button><button type="button" id="dwt-spark-x">×</button></div><div id="dwt-spark-list"></div>';
      document.body.appendChild(root);
      const input = root.querySelector('#dwt-spark-in');
      const list = root.querySelector('#dwt-spark-list');
      root.querySelector('#dwt-spark-go').addEventListener('click', () => renderList(list, input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') renderList(list, input.value);
      });
      root.querySelector('#dwt-spark-x').addEventListener('click', () => { root.style.display = 'none'; });
    }
    // 标题右侧 ⓘ：悬停出表格化说明（rail 菜单行标题右侧共用同一份 HELP）
    window.dwt?.helpTip?.attach?.(root.querySelector('h3'), HELP);
    // 拖拽：标题行为把手（面板原本钉在右下角，会压住 rail/输入框）
    window.dwt?.drag?.attach?.(root, { key: 'spark', handle: root.querySelector('h3') });
  }

  function apply() {
    if (!enabled) {
      document.getElementById(ROOT_ID)?.remove();
      try { window.dwt?.rail?.remove?.('spark'); } catch (_) {}
      return;
    }
    mountRail();
    mount();
    const root = document.getElementById(ROOT_ID);
    if (root) root.style.display = 'block';
    window.dwt?.rail?.setActive?.('spark', true);
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(FEAT_KEY);
      enabled = r[FEAT_KEY] === true;
    } catch (_) { enabled = false; }
    apply();
  }

  // 统一工具栏入口：仅功能开启时出现；关掉从菜单移除
  function mountRail() {
    try { window.dwt?.rail?.remove?.('spark'); } catch (_) {}
    if (!enabled) return;
    window.dwt?.rail?.add?.({
      id: 'spark',
      icon: '✨',
      title: '视觉关键词',
      order: 46,
      onClick: () => dwt.keywordSparkModule.setEnabled(!dwt.keywordSparkModule.isEnabled()),
    });
  }

  // 开关落盘：rail 关掉若不写 storage，bootSync 会按旧 true 把入口复活
  function setEnabled(v) {
    const next = !!v;
    const changed = next !== enabled;
    enabled = next;
    apply();
    if (changed) {
      try { void chrome.storage.local.set({ [FEAT_KEY]: enabled }); } catch (_) {}
    }
  }

  dwt.keywordSparkModule = {
    setEnabled,
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] keyword-spark ready (#56)');
})();
