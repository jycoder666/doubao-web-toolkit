// keyword-spark/module.js — 视觉检索关键词（#56 PinSpark 本地精简）
// 中文主题 → Pinterest / Behance / 花瓣检索词，只在本地拼接，不请求外站。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_keyword_spark';
  const ROOT_ID = 'dwt-spark-root';
  const STYLE_ID = 'dwt-spark-style';

  let enabled = false;

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
        position: fixed; left: 16px; bottom: 16px; z-index: 999990;
        width: 280px; background: #fff; border: 1px solid #d0d7de; border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12); font-family: system-ui, sans-serif;
        color: #1f2328; font-size: 12px; padding: 10px;
      }
      #${ROOT_ID} h3 { margin: 0 0 6px; font-size: 13px; }
      #${ROOT_ID} .row { display: flex; gap: 6px; }
      #${ROOT_ID} input { flex: 1; border: 1px solid #d0d7de; border-radius: 6px; padding: 4px 6px; }
      #${ROOT_ID} button { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; }
      #${ROOT_ID} .site { margin-top: 8px; font-weight: 600; }
      #${ROOT_ID} .chip {
        display: inline-block; margin: 4px 4px 0 0; padding: 2px 6px; border-radius: 999px;
        background: #ddf4ff; cursor: pointer;
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
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();
    const root = document.createElement('div');
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

  function apply() {
    if (!enabled) {
      document.getElementById(ROOT_ID)?.remove();
      return;
    }
    mount();
    const root = document.getElementById(ROOT_ID);
    if (root) root.style.display = 'block';
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(FEAT_KEY);
      enabled = r[FEAT_KEY] === true;
    } catch (_) { enabled = false; }
    apply();
  }

  dwt.keywordSparkModule = {
    setEnabled(v) { enabled = !!v; apply(); },
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] keyword-spark ready (#56)');
})();
