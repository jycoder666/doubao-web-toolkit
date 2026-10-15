// runner.js —— 批量输入 + 验证码暂停 · 状态机
//
// States: IDLE → RUNNING → WAITING_REPLY → PAUSED_BY_CAPTCHA / PAUSED_BY_TIMEOUT → RUNNING
//                                                               └── DONE
// 触发：chrome.runtime.onMessage('START_BATCH')
// 暂停：chrome.runtime.onMessage('PAUSE_BATCH')
// 继续：chrome.runtime.onMessage('RESUME_BATCH')
// 跳过：chrome.runtime.onMessage('SKIP_BATCH')
// 终止：chrome.runtime.onMessage('STOP_BATCH')

import replyState from '../core/reply-state.js';
import captchaDetector from '../core/captcha-detector.js';

const STATES = ['IDLE', 'RUNNING', 'WAITING_REPLY', 'PAUSED_BY_CAPTCHA', 'PAUSED_BY_TIMEOUT', 'DONE'];

function getSendButton() {
  const btns = document.querySelectorAll('button');
  let best = null, bestRight = -1;
  for (const b of btns) {
    if (b.disabled) continue;
    if (!b.querySelector('svg')) continue;
    const r = b.getBoundingClientRect();
    if (r.top <= 550) continue;
    if (r.right > bestRight) {
      bestRight = r.right;
      best = b;
    }
  }
  return best;
}

async function dispatchInput(text) {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) throw new Error('ProseMirror 输入框未找到');
  pm.focus();
  pm.innerHTML = `<p dir="auto">${text}</p>`;
  pm.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }));
  pm.dispatchEvent(new Event('change', { bubbles: true }));
}

async function clickSend() {
  const btn = getSendButton();
  if (!btn) throw new Error('发送按钮未找到');
  btn.click();
}

export default class BatchRunner {
  constructor(items, opts = {}) {
    this.items = items;                          // [{ text, waitType, timeout }, ...]
    this.minInterval = opts.minInterval || 3;     // 秒
    this.replyTimeout = opts.replyTimeout || 180; // 秒
    this.captchaSelectors = opts.captchaSelectors || [];

    this.index = 0;
    this.state = 'IDLE';
    this.stopFlag = false;
    this.skipFlag = false;
    this._onEvent = null;

    if (this.captchaSelectors.length) captchaDetector.setSelectors(this.captchaSelectors);
    captchaDetector.start();
    window.addEventListener('dwt-captcha-change', this._onCaptchaChange.bind(this));
  }

  onEvent(fn) { this._onEvent = fn; }

  _emit() { this._onEvent?.({ state: this.state, index: this.index, total: this.items.length }); }

  async run() {
    this.state = 'RUNNING'; this._emit();
    for (; this.index < this.items.length; this.index++) {
      if (this.stopFlag) break;
      const item = this.items[this.index];

      // 人工等待项
      if (!item.text) {
        this.state = 'WAITING_MANUAL'; this._emit();
        await this._waitForResume();
        continue;
      }

      // 验证码检测（暂停）
      if (captchaDetector.isDetected()) {
        this.state = 'PAUSED_BY_CAPTCHA'; this._emit();
        await this._waitForResume();
      }

      // 最小间隔
      await new Promise((r) => setTimeout(r, this.minInterval * 1000));
      if (this.stopFlag) break;

      // 输入 + 发送
      this.state = 'RUNNING'; this._emit();
      await dispatchInput(item.text);
      await clickSend();

      // 等回复
      this.state = 'WAITING_REPLY'; this._emit();
      try {
        await replyState.whenDone({ timeout: (item.timeout || this.replyTimeout) * 1000 });
      } catch (e) {
        this.state = 'PAUSED_BY_TIMEOUT'; this._emit();
        await this._waitForResume();
      }
    }
    this.state = 'DONE'; this._emit();
    this.cleanup();
  }

  async _waitForResume() {
    await new Promise((resolve) => {
      const onMsg = (msg, _sender, sendResp) => {
        if (msg?.type === 'BATCH_RESUME') {
          chrome.runtime.onMessage.removeListener(onMsg);
          sendResp({ ok: true }); resolve();
        }
      };
      chrome.runtime.onMessage.addListener(onMsg);
    });
  }

  _onCaptchaChange(e) {
    if (e.detail.detected && this.state !== 'PAUSED_BY_CAPTCHA') {
      this.state = 'PAUSED_BY_CAPTCHA'; this._emit();
      // 通知 popup
      chrome.runtime.sendMessage({ type: 'BATCH_CAPTCHA_DETECTED' });
    }
  }

  pause()  { /* 由 popup 发 RESUME 消息放行 */ }
  resume() { chrome.runtime.sendMessage({ type: 'BATCH_RESUME' }); }
  skip()   { this.index++; this.skipFlag = true; }
  stop()   { this.stopFlag = true; this.state = 'DONE'; this._emit(); this.cleanup(); }

  cleanup() {
    captchaDetector.stop();
    window.removeEventListener('dwt-captcha-change', this._onCaptchaChange.bind(this));
  }
}
