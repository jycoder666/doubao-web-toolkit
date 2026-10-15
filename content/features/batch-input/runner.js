// batch-input/runner.js — 批量输入 + 验证码暂停 状态机
// States: IDLE → RUNNING → WAITING_REPLY → PAUSED_BY_CAPTCHA / PAUSED_BY_TIMEOUT → DONE
(function () {
  'use strict';

  const { selectorManager, replyState, captchaDetector } = window.dwt;

  function dispatchInput(text) {
    const pm = selectorManager.getInput();
    if (!pm) throw new Error('ProseMirror 输入框未找到');
    pm.focus();
    pm.innerHTML = '<p dir="auto">' + text + '</p>';
    pm.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }));
    pm.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function clickSend() {
    const btn = await selectorManager.waitForSend(10000);
    btn.click();
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
      captchaDetector.start();
      window.addEventListener('dwt-captcha-change', (e) => {
        if (e.detail.detected && this.state !== 'PAUSED_BY_CAPTCHA') {
          this.state = 'PAUSED_BY_CAPTCHA';
          this._emit();
          chrome.runtime.sendMessage({ type: 'BATCH_CAPTCHA_DETECTED' }).catch(() => {});
        }
      });
    }

    onEvent(fn) { this._cb = fn; }
    _emit() { this._cb && this._cb({ state: this.state, index: this.index, total: this.items.length }); }

    waitForResume() {
      return new Promise((resolve) => {
        const handler = (msg) => {
          if (msg && msg.type === 'BATCH_RESUME') {
            chrome.runtime.onMessage.removeListener(handler);
            resolve();
          }
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
        if (captchaDetector.isDetected()) {
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
        try { dispatchInput(item.text); await clickSend(); }
        catch (e) {
          console.error('[dwt-batch] send failed:', e);
          continue;
        }

        // 等回复
        this.state = 'WAITING_REPLY'; this._emit();
        try {
          await replyState.whenDone({ timeout: (item.timeout || this.replyTimeout) * 1000 });
        } catch (e) {
          this.state = 'PAUSED_BY_TIMEOUT'; this._emit();
          await this.waitForResume();
        }
      }
      this.state = 'DONE'; this._emit();
      captchaDetector.stop();
    }

    stop() { this.stopFlag = true; this.state = 'DONE'; this._emit(); captchaDetector.stop(); }
  }

  window.BatchRunner = BatchRunner;
})();
