// enhance/module.js — 自动滚动跟随 (不再渲染悬浮按钮)
// 顶部维护:
//   - 历史版本渲染了一个右下角 ⬇ 悬浮按钮, 但豆包本身已有「拉到最底」功能,
//     两者重复且视觉干扰, 故移除按钮, 仅保留「自动跟随」逻辑: 当用户已滚到底部
//     附近 (<200px) 时, 新消息出现自动追随, 用户主动上滑查看历史时不干扰。
//   - 真实滚动容器: selectorManager.getScroller() 返回 div.v_list_scroller-*
//     (豆包 window 不滚动, 内部容器才滚动), 回退兜底面积最大可滚动元素。
(function () {
  'use strict';

  const dwt = window.dwt = window.dwt || {};

  // ---------- 滚动工具 ----------
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

  function scrollToBottom(smooth) {
    const sc = getScroller();
    const target = sc || document.documentElement;
    target.scrollTo({ top: target.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ---------- 自动跟随: 新消息出现时, 若用户已在底部附近则自动跟随 ----------
  let autoEnabled = true;
  let lastHeight = 0;
  let observer = null;

  function observeChanges() {
    if (observer) observer.disconnect();
    const sc = getScroller();
    if (!sc) return;
    observer = new MutationObserver(() => {
      if (!autoEnabled) return;
      const h = sc.scrollHeight;
      if (h !== lastHeight) {
        lastHeight = h;
        // 距底部 < 200px 视为"用户在底部附近", 自动跟随; 若用户正在往上看历史, 不打扰
        if (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 200) {
          sc.scrollTop = sc.scrollHeight;
        }
      }
    });
    observer.observe(sc, { childList: true, subtree: true, characterData: true });
  }

  dwt.enhanceModule = {
    scrollToBottom, observeChanges, getScroller,
    setAuto: (v) => autoEnabled = v,
  };

  // 每 4 秒重新绑定一次 (防止容器被重渲染后 observer 丢失)
  observeChanges();
  setInterval(observeChanges, 4000);

  console.log('[cs][doubao-web-toolkit] enhance module ready (auto-follow only, no float btn)');
})();
