// enhance/module.js — 自动滚动到底部 + 悬浮快捷按钮
// 顶部维护:
//   - 原实现用 [class*="message-list"] 作滚动容器, 但豆包页面上不存在此 class,
//     导致 scrollToBottom 回退到 documentElement.scrollTo → 点击无效 (因为豆包
//     真正滚动的是内部 div.v_list_scroller-* 容器, 而 window 不滚动)。
//   - 修复: 通过 selectorManager.getScroller() 获取真实滚动容器后再滚动。
//   - 按钮位置: 从左侧 left:12px 移到右侧 right:12px, 与 navigator / prompt-bar 等
//     保持同侧, 避免左侧会话栏遮挡。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  // ---------- 滚动工具: 必须通过 selectorManager.getScroller() 拿真实容器 ----------
  function getScroller() {
    const sm = dwt.selectorManager;
    if (sm && sm.getScroller) {
      const el = sm.getScroller();
      if (el) return el;
    }
    // 兜底: 直接查候选选择器, 取面积最大的可滚动元素
    let best = null, bestArea = 0;
    document.querySelectorAll('[class*="v_list_scroller"], [class*="message-list"], [class*="scroller"]').forEach((el) => {
      if (el.scrollHeight <= el.clientHeight + 20) return;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = el; }
    });
    return best;
  }

  // 滚动聊天区到底部 (smooth=true 平滑滚动, false 直接跳转)
  function scrollToBottom(smooth) {
    const sc = getScroller();
    const target = sc || document.documentElement;
    target.scrollTo({ top: target.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ---------- 悬浮按钮 ----------
  function mount() {
    if (document.getElementById('dwt-enhance-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'dwt-enhance-btn';
    btn.textContent = '⬇';
    btn.title = '滚动到最底部';
    // 位置: 右侧 right:12px, 底栏上方 bottom:96px (debug-panel toggle 在 bottom:12px,
    // prompt-bar 在 bottom:64px, 留 28px 间距避免重叠)
    btn.style.cssText = 'position:fixed;bottom:96px;right:12px;z-index:999998;width:32px;height:32px;border-radius:50%;border:1px solid #d0d7de;background:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:14px;line-height:1;';
    btn.onclick = () => scrollToBottom(true);
    document.body.appendChild(btn);
  }

  // ---------- 自动滚动: 新消息出现时, 若用户已在底部附近则自动滚到底 ----------
  let autoEnabled = true;
  let lastHeight = 0;

  function observeChanges() {
    const sc = getScroller();
    if (!sc) return;
    const obs = new MutationObserver(() => {
      if (!autoEnabled) return;
      const h = sc.scrollHeight;
      if (h !== lastHeight) {
        lastHeight = h;
        // 距底部 < 200px 视为"用户在底部附近", 自动跟随
        if (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 200) {
          sc.scrollTop = sc.scrollHeight;
        }
      }
    });
    obs.observe(sc, { childList: true, subtree: true, characterData: true });
  }

  dwt.enhanceModule = {
    mount, scrollToBottom, observeChanges, getScroller,
    setAuto: (v) => autoEnabled = v,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); observeChanges(); });
  } else {
    mount(); observeChanges();
  }

  console.log('[doubao-web-toolkit] enhance module ready');
})();
