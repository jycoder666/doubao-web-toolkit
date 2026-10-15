// reply-state.js —— 豆包"是否正在生成回复"的状态机
// 用法：replyState.isGenerating() → boolean | replyState.whenDone() → Promise

import { waitForElement } from './dom-observer.js';

const LOADING_SELECTORS = [
  '[class*="thinking" i]',
  '[class*="streaming" i]',
  '[class*="loading" i]',
  '[class*="typing" i]',
  '[class*="wait"]',
];

export default {
  // 正在生成回复？
  isGenerating() {
    return LOADING_SELECTORS.some((sel) => document.querySelector(sel) !== null);
  },

  // 等回复完成（loading 元素全部消失），兜底超时
  async whenDone(opts = {}) {
    const { timeout = 180000 } = opts;
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (!this.isGenerating()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error(`reply timeout after ${timeout}ms`));
        }
      }, 500);
    });
  },

  // 等回复"开始"生成（loading 元素出现）
  async whenStarts(opts = {}) {
    const { timeout = 10000 } = opts;
    try {
      await waitForElement(LOADING_SELECTORS.join(','), { timeout });
      return true;
    } catch (_) {
      return false;
    }
  },
};
