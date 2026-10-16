// batch-input/runner.js — 批量输入 + 验证码暂停 状态机
// States: IDLE → RUNNING → WAITING_REPLY → PAUSED_BY_CAPTCHA / PAUSED_BY_TIMEOUT → DONE
(function () {
  'use strict';

  // 安全访问: 用可选链避免硬依赖加载顺序
  const dwt = window.dwt || {};
  const selectorManager = dwt.selectorManager;
  const replyState = dwt.replyState;
  const captchaDetector = dwt.captchaDetector;

  function dispatchInput(text) {
    const pm = selectorManager.getInput();
    if (!pm) throw new Error('ProseMirror 输入框未找到');
    pm.focus();
    // 空输入时豆包隐藏 send-btn-wrapper（只留语音）。
    // execCommand(insertText) 能改 DOM 文本但不会唤醒发送钮；必须 innerHTML + input。
    pm.innerHTML = '<p dir="auto">' + text + '</p>';
    pm.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }));
    pm.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getRealSendButton() {
    const wrapped = document.querySelector('.send-btn-wrapper button');
    if (wrapped && !wrapped.disabled) return wrapped;
    const byCls = document.querySelector('button[class*="bg-g-send-msg-btn"]');
    if (byCls && !byCls.disabled) return byCls;
    return null;
  }

  async function waitForRealSend(timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const btn = getRealSendButton();
        if (btn) { clearInterval(timer); resolve(btn); }
        else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('发送按钮未出现 (send-btn-wrapper)'));
        }
      }, 100);
    });
  }

  async function clickSend() {
    const btn = await waitForRealSend(10000);
    btn.click();
  }

  function countUserBubbles() {
    return document.querySelectorAll('[class*="bg-g-send-msg-bubble-bg"]').length;
  }

  async function waitSendAck(beforeCount, sentText, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    const start = Date.now();
    const needle = (sentText || '').trim().slice(0, 40);
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const bubbles = document.querySelectorAll('[class*="bg-g-send-msg-bubble-bg"]');
        const grew = bubbles.length > beforeCount;
        let matched = false;
        if (needle) {
          for (let i = bubbles.length - 1; i >= Math.max(0, bubbles.length - 3); i--) {
            if ((bubbles[i].innerText || '').indexOf(needle) >= 0) { matched = true; break; }
          }
        }
        if (grew || matched) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('send not acknowledged (no new user bubble)'));
        }
      }, 200);
    });
  }

  class BatchRunner {
    constructor(items, opts) {
      opts = opts || {};
      this.items = items;
      this.minInterval = opts.minInterval || 3;
      this.replyTimeout = opts.replyTimeout || 180;
      this.index = 0;
      this.state = 'IDLE';
      this.stopFlag = false;
      this._cb = null;
      if (captchaDetector) {
        captchaDetector.start();
        window.addEventListener('dwt-captcha-change', (e) => {
          if (e.detail.detected && this.state !== 'PAUSED_BY_CAPTCHA') {
            this.state = 'PAUSED_BY_CAPTCHA';
            this._emit();
            chrome.runtime.sendMessage({ type: 'BATCH_CAPTCHA_DETECTED' }).catch(() => {});
          }
        });
      }
    }

    onEvent(fn) { this._cb = fn; }
    _emit() { this._cb && this._cb({ state: this.state, index: this.index, total: this.items.length }); }

    waitForResume() {
      return new Promise((resolve) => {
        const handler = (msg, sender, sendResponse) => {
          if (msg && msg.type === 'BATCH_RESUME') {
            chrome.runtime.onMessage.removeListener(handler);
            sendResponse({ ok: true });
            resolve();
            return true;
          }
          return false;
        };
        chrome.runtime.onMessage.addListener(handler);
      });
    }

    async run() {
      this.state = 'RUNNING'; this._emit();
      for (; this.index < this.items.length; this.index++) {
        if (this.stopFlag) break;
        const item = this.items[this.index];

        // 人工等待项
        if (!item.text) {
          this.state = 'WAITING_MANUAL'; this._emit();
          await this.waitForResume();
          continue;
        }

        // 验证码暂停
        if (captchaDetector && captchaDetector.isDetected()) {
          this.state = 'PAUSED_BY_CAPTCHA'; this._emit();
          await this.waitForResume();
          if (captchaDetector.isDetected()) {
            // 还在, 可能是用户误放行, 再暂停
            this.state = 'PAUSED_BY_CAPTCHA'; this._emit();
            await this.waitForResume();
          }
        }

        // 最小间隔
        await new Promise(r => setTimeout(r, this.minInterval * 1000));
        if (this.stopFlag) break;

        // 输入 + 发送
        this.state = 'RUNNING'; this._emit();
        const bubblesBefore = countUserBubbles();
        try {
          dispatchInput(item.text);
          await clickSend();
          await waitSendAck(bubblesBefore, item.text, 8000);
        } catch (e) {
          console.error('[dwt-batch] send failed:', e);
          this.state = 'PAUSED_BY_TIMEOUT'; this._emit();
          await this.waitForResume();
          continue;
        }

        // 等回复（先等开始生成，再等结束）
        this.state = 'WAITING_REPLY'; this._emit();
        try {
          await replyState.whenDone({ timeout: (item.timeout || this.replyTimeout) * 1000 });
        } catch (e) {
          console.error('[dwt-batch] reply wait failed:', e);
          this.state = 'PAUSED_BY_TIMEOUT'; this._emit();
          await this.waitForResume();
        }
      }
      this.state = 'DONE'; this._emit();
      if (captchaDetector) captchaDetector.stop();
    }

    stop() { this.stopFlag = true; this.state = 'DONE'; this._emit(); if (captchaDetector) captchaDetector.stop(); }
  }

  window.BatchRunner = BatchRunner;
})();
