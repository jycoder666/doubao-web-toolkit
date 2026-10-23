// arxiv-prompt/module.js — 把 arXiv 编号/链接写成解读提示插入输入框 (#105)
// 不抓取论文、不调用 arXiv API。默认关闭。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};
  const FEAT_KEY = 'dwt_arxiv_prompt';
  const ROOT_ID = 'dwt-arxiv-root';
  const STYLE_ID = 'dwt-arxiv-style';

  let enabled = false;

  // ⓘ 用法说明：rail 菜单行标题右侧
  // 「论文网站」行在 tip 弹出后由 linkifyHelpSite 换成可点 <a>（helpTip 单元格只走 textContent）
  const ARXIV_SITE = 'https://arxiv.org/';
  const HELP = {
    title: '🅰 arXiv 解读提示',
    desc: '把 arXiv 编号 / 链接套成一段「按这个结构解读论文」的提示词，插进输入框。',
    rows: [
      ['论文网站', ARXIV_SITE + ' — 可搜论文，复制 abs 编号/链接'],
      ['怎么用', '点工具栏 🅰 打开条子 → 填编号（如 2401.12345）或粘链接 → 插入解读'],
      ['关闭', '点条子上的 ×：隐藏条子并关掉功能；再点工具栏 🅰 可重新打开'],
      ['编号会自动补全', '写成 https://arxiv.org/abs/<编号>；ar5iv 链接原样保留'],
      ['插入的提示词', '「请用中文解读这篇 arXiv 论文：<链接>。包括：要解决的问题、方法、主要结果、局限。」——只填不发'],
    ],
    note: '不抓论文、不调 arXiv 接口、不读 PDF：本模块只做「编号 → 提示词」的本地拼接，论文内容要模型自己去读。',
  };

  // helpTip 共享卡只用 textContent；本模块 tip 弹出后把「论文网站」值列换成新标签链接
  function linkifyHelpSite() {
    const card = document.getElementById(window.dwt?.helpTip?.CARD_ID || 'dwt-help-tip-card');
    if (!card || card.style.display === 'none') return;
    const title = card.querySelector('.dwt-ht-title');
    if (!title || title.textContent.indexOf('arXiv') < 0) return;
    if (card.querySelector('a.dwt-arxiv-site')) return;
    const keys = card.querySelectorAll('td.k');
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].textContent !== '论文网站') continue;
      const v = keys[i].nextElementSibling;
      if (!v || v.tagName !== 'TD') return;
      v.textContent = '';
      const a = document.createElement('a');
      a.className = 'dwt-arxiv-site';
      a.href = ARXIV_SITE;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = ARXIV_SITE;
      a.style.color = 'var(--dwt-accent, #2d72de)';
      v.appendChild(a);
      v.appendChild(document.createTextNode(' — 可搜论文，复制 abs 编号/链接'));
      return;
    }
  }

  // 面板标题 ⓘ；全局听 help 按钮，把「论文网站」值列换成可点链接
  function armHelpLinkify() {
    if (armHelpLinkify._on) return;
    armHelpLinkify._on = true;
    const btnCls = () => window.dwt?.helpTip?.BTN_CLASS || 'dwt-help-btn';
    const run = () => setTimeout(linkifyHelpSite, 150);
    document.addEventListener('mouseover', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.' + btnCls())) run();
    }, true);
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains(btnCls())) run();
    }, true);
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.' + btnCls())) run();
    }, true);
  }

  function normalize(raw) {
    const s = (raw || '').trim();
    const id = s.match(/(\d{4}\.\d{4,5})(v\d+)?/);
    if (id) return 'https://arxiv.org/abs/' + id[1] + (id[2] || '');
    if (/^https?:\/\/(arxiv\.org|ar5iv\.labs\.arxiv\.org)\//i.test(s)) return s;
    return '';
  }

  function insertPrompt(url) {
    const pm = dwt.selectorManager?.getInput?.() || document.querySelector('.ProseMirror');
    if (!pm) return false;
    const chunk = '请用中文解读这篇 arXiv 论文：' + url + '。包括：要解决的问题、方法、主要结果、局限。';
    // 禁止 pm.innerHTML 直写：ProseMirror 内部 state 与被替换的 DOM 失配后,
    // 下一次事务即抛 removeChild NotFoundError, 整页崩溃。必须走输入事件链。
    pm.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(pm);
      sel.collapseToEnd();
      if (!document.execCommand('insertText', false, chunk)) throw new Error('execCommand rejected');
      return true;
    } catch (_) {
      try {
        pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: chunk }));
        pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: chunk }));
        return true;
      } catch (_) { return false; }
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${ROOT_ID} {
        position: fixed; right: 12px; bottom: 56px; z-index: 999990;
        background: var(--dwt-bg, #fff); color: var(--dwt-fg, #1f2328);
        border: 1px solid var(--dwt-border, #d0d7de); border-radius: 10px;
        box-shadow: 0 6px 18px rgba(0,0,0,.12); padding: 8px; font: 12px system-ui, sans-serif;
        display: flex; gap: 6px; align-items: center;
      }
      #${ROOT_ID} input { width: 180px; border: 1px solid var(--dwt-border, #d0d7de); border-radius: 6px; padding: 4px 6px; background: var(--dwt-soft, #f6f8fa); color: inherit; }
      #${ROOT_ID} button { border: 1px solid var(--dwt-border, #d0d7de); background: var(--dwt-soft, #f6f8fa); border-radius: 6px; cursor: pointer; color: inherit; }
      #${ROOT_ID} #dwt-arxiv-x {
        border: none; background: transparent; font-size: 14px; line-height: 1;
        padding: 2px 4px; opacity: .7;
      }
      #${ROOT_ID} #dwt-arxiv-x:hover { opacity: 1; }
      #${ROOT_ID} .err { color: #cf222e; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<span>arXiv</span><input id="dwt-arxiv-in" placeholder="2401.12345 或链接"><button type="button" id="dwt-arxiv-go">插入解读</button><button type="button" id="dwt-arxiv-x" title="关闭" aria-label="关闭">×</button><span class="err" id="dwt-arxiv-err"></span>';
    document.body.appendChild(root);
    // 标题右侧 ⓘ：悬停出表格化说明（rail 菜单行标题右侧共用同一份 HELP）
    armHelpLinkify();
    window.dwt?.helpTip?.attach?.(root.querySelector('span'), HELP);
    root.querySelector('#dwt-arxiv-go').addEventListener('click', () => {
      const err = root.querySelector('#dwt-arxiv-err');
      const url = normalize(root.querySelector('#dwt-arxiv-in').value);
      if (!url) { err.textContent = '无法识别'; return; }
      err.textContent = insertPrompt(url) ? '' : '无输入框';
    });
    // ×：隐藏条子并关掉功能（与 rail 🅰 开关一致；再点 rail 可打开）
    root.querySelector('#dwt-arxiv-x').addEventListener('click', () => {
      dwt.arxivPromptModule.setEnabled(false);
    });
  }

  function apply() {
    if (!enabled) {
      document.getElementById(ROOT_ID)?.remove();
      try { window.dwt?.rail?.remove?.('arxiv'); } catch (_) {}
      return;
    }
    mountRail();
    mount();
    window.dwt?.rail?.setActive?.('arxiv', true);
  }

  async function init() {
    try {
      const r = await chrome.storage.local.get(FEAT_KEY);
      enabled = r[FEAT_KEY] === true;
    } catch (_) { enabled = false; }
    apply();
  }

  // 统一工具栏入口：仅开启时挂；关掉整项移除
  function mountRail() {
    armHelpLinkify();
    try { window.dwt?.rail?.remove?.('arxiv'); } catch (_) {}
    if (!enabled) return;
    window.dwt?.rail?.add?.({
      id: 'arxiv',
      icon: '🅰',
      title: 'arXiv 解读提示',
      order: 45,
      onClick: () => dwt.arxivPromptModule.setEnabled(!dwt.arxivPromptModule.isEnabled()),
    });
  }

  // 开关落盘：rail / × 关掉若不写 storage，bootSync 会按旧 true 把入口复活
  function setEnabled(v) {
    const next = !!v;
    const changed = next !== enabled;
    enabled = next;
    apply();
    if (changed) {
      try { void chrome.storage.local.set({ [FEAT_KEY]: enabled }); } catch (_) {}
    }
  }

  dwt.arxivPromptModule = {
    setEnabled,
    isEnabled: () => enabled,
    init,
  };

  init();
  console.log('[cs][doubao-web-toolkit] arxiv-prompt ready (#105)');
})();
