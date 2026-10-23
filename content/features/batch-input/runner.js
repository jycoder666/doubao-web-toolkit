// batch-input/runner.js — 批量输入 + 验证码暂停 状态机 (v5: 记录 reply/result + TIMEOUT)
// States: IDLE → RUNNING → WAITING_REPLY → PAUSED_BY_* → DONE | STOPPED
// v5.16: metaToFile 已兼容 data / dataUrl（panel 从 storage 恢复后仍可发送）
// v5.2: 多附件 — item.attachments[] / _files[] 按序挂到豆包 (上限 10, 对齐 maxFileCount)
// v5.1: 附件发送 — item.attachment / _file / imageDataUrl → 豆包 file input (图/文档/音频)
// v5 变更:
//   1) 每条完成后把助手回复写入 itemStates[i].reply / .result, 供面板表格/JSON 展示;
//   2) 回复等待超时标 TIMEOUT (区别于发送失败 FAILED)。
// v4 变更:
//   1) opts.startIndex: 从指定下标起跑 (断点续传); 此前条目标 DONE;
//   2) 用户 stop() / stopFlag 中断 → state=STOPPED (非 DONE), 保留 index 供面板记断点。
// v3 变更:
//   1) opts.prefix 全局前置词: 发送前拼在每条文本开头 (prefix + '\n' + text), 图片条目同样生效;
//   2) item.replyCheck 回复约束: 'plain'=回复必须纯文本 (无 <img>), 'image'=回复必须含图;
//      waitReplyDone 成功后取最后一条助手消息块校验 (选择器复用 export 模块),
//      不满足 → 条目标 FAILED_CONSTRAINT (约束未满足) + PAUSED_BY_CONSTRAINT 暂停;
//      用户点「继续下一条」(BATCH_RESUME) 后跳过该条继续下一条, for 循环自然推进;
//   3) dispatchInput 拼 innerHTML 前对文本做 HTML 转义, 防前置词/内容含 < > & 被 ProseMirror 当标签吞掉。
// v2 变更:
//   1) 每条 item 独立状态 (PENDING/SENDING/WAITING/DONE/FAILED/PAUSED/SKIPPED),
//      随 _emit 广播 { state, index, total, items }, 供 panel 逐条渲染徽标;
//   2) 支持 { text, imageDataUrl } 条目: 图片走 DataTransfer+File → ClipboardEvent('paste')
//      让豆包编辑器自己走上传链, 文字用 execCommand 追加 (严禁 innerHTML 清掉已贴图);
//   3) 每次关键 await 之后都复查 stopFlag, stop() 后绝不发新条目;
//   4) 空条目 (无文本且无图) 直接标记 SKIPPED 跳过, 不再无限等放行;
//   5) for 循环自然结束 → DONE → 停止, 不循环重发 (重复启动由 module.js 守卫拒绝)。
(function () {
  'use strict';

  const dwt = window.dwt || {};
  const selectorManager = dwt.selectorManager;
  const replyState = dwt.replyState;
  const captchaDetector = dwt.captchaDetector;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 归一化文本用于比对: 只留字母数字汉字 (2026-10-18 浏览器实证):
  //   1) 豆包发送时把半角标点转全角 (':'→'：' '?'→'？'), 原文 needle 在气泡里匹配不到;
  //   2) 消息列表虚拟滚动会回收顶部节点, 发送后气泡总数可能不增, count 判据不可靠。
  //   因此 ack / 回复增长检测一律用归一化后的文本匹配, 计数只作辅助信号。
  function normText(s) {
    return String(s == null ? '' : s).replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '');
  }

  // 对齐豆包 uploadMultiEntityConf.maxFileCount（Glass CDP 2026-10-19）
  const DOUBAO_ATTACH_MAX = 10;

  function listAttachMeta(item) {
    if (!item) return [];
    if (Array.isArray(item.attachments) && item.attachments.length) {
      return item.attachments.filter(Boolean).slice(0, DOUBAO_ATTACH_MAX);
    }
    if (item.attachment) return [item.attachment];
    return [];
  }

  function hasAttach(item) {
    if (!item) return false;
    if (item._files && item._files.length) return true;
    if (item._file) return true;
    if (item.imageDataUrl) return true;
    const list = listAttachMeta(item);
    return list.some((a) => a && (a.objectUrl || a.dataUrl || a.data));
  }

  async function metaToFile(att, fallbackDataUrl) {
    const name = (att && (att.fileName || att.name)) || 'file';
    const mime = (att && (att.mime || att.type)) || '';
    if (att && att.file) return att.file;
    const src = (att && (att.objectUrl || att.dataUrl || att.data)) || fallbackDataUrl || '';
    if (!src) throw new Error('无附件数据 (需 File / objectUrl / dataUrl)');
    const blob = await (await fetch(src)).blob();
    return new File([blob], name, { type: mime || blob.type || 'application/octet-stream' });
  }

  function dispatchInput(text) {
    const pm = selectorManager.getInput();
    if (!pm) throw new Error('ProseMirror 输入框未找到');
    pm.focus();
    // 空输入时豆包隐藏 send-btn-wrapper（只留语音）。
    // execCommand(insertText) 能改 DOM 文本但不会唤醒发送钮；必须 innerHTML + input。
    // 仅用于「纯文本条目」——附件条目绝不能走这里 (会清掉已挂文件)。
    pm.innerHTML = '<p dir="auto">' + escapeHtml(text) + '</p>';
    pm.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }));
    pm.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 清空输入区（附件条目重试前用：否则第二次会再挂一遍同一批文件）
  function clearComposer() {
    const pm = selectorManager.getInput();
    if (!pm) return;
    try {
      pm.focus();
      const sel = window.getSelection();
      if (sel) sel.selectAllChildren(pm);
      document.execCommand('delete');
    } catch (_) {}
  }

  async function resolveAttachFiles(item) {
    // 优先 attachments 元数据（每项可自带 file / objectUrl / dataUrl），避免 _files 半截漏挂
    const metas = listAttachMeta(item);
    if (metas.length) {
      const out = [];
      for (let i = 0; i < metas.length && out.length < DOUBAO_ATTACH_MAX; i++) {
        out.push(await metaToFile(metas[i], i === 0 ? (item && item.imageDataUrl) : ''));
      }
      return out;
    }
    if (item && Array.isArray(item._files) && item._files.length) {
      return item._files.filter(Boolean).slice(0, DOUBAO_ATTACH_MAX);
    }
    if (item && item._file) return [item._file];
    if (item && item.imageDataUrl) {
      return [await metaToFile({ fileName: 'image.png', mime: 'image/png', dataUrl: item.imageDataUrl }, item.imageDataUrl)];
    }
    throw new Error('无附件数据 (需 File / objectUrl / dataUrl)');
  }

  async function resolveAttachFile(item) {
    const files = await resolveAttachFiles(item);
    return files[0];
  }

  // 选豆包原生 file input: 优先 accept 含扩展名的主附件框; 图片可退 image/*; 跳过面板自有 input
  function findDoubaoFileInput(file) {
    const inputs = document.querySelectorAll('input[type="file"]');
    const name = String((file && file.name) || '').toLowerCase();
    const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '';
    const mime = String((file && file.type) || '').toLowerCase();
    let byExt = null;
    let byImage = null;
    let byPdf = null;
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      const id = el.id || '';
      if (id === 'dwt-batch-file' || id === 'dwt-batch-import-file') continue;
      const acc = (el.getAttribute('accept') || '').toLowerCase().replace(/\s+/g, '');
      if (!acc) continue;
      if (ext && acc.indexOf(ext) >= 0) {
        if (!byExt || acc.length > (byExt.getAttribute('accept') || '').length) byExt = el;
      }
      if (acc.indexOf('.pdf') >= 0 && !byPdf) byPdf = el;
      if (acc.split(',').some((s) => s.trim() === 'image/*')) byImage = el;
    }
    if (byExt) return byExt;
    if (mime.indexOf('image/') === 0 && byImage) return byImage;
    return byPdf || byImage || null;
  }

  // 附件: 优先驱动豆包 file input (多文件按序写入 DataTransfer); 找不到再退合成 paste
  async function pasteAttachment(pm, item) {
    const files = await resolveAttachFiles(item);
    if (!files.length) throw new Error('无附件数据');
    const target = findDoubaoFileInput(files[0]);
    if (target) {
      const dt = new DataTransfer();
      files.forEach((f) => { try { dt.items.add(f); } catch (_) {} });
      target.files = dt.files;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // paste 兜底: 逐个粘贴 (部分环境 ClipboardEvent 只吃首个 file)
    pm.focus();
    for (let i = 0; i < files.length; i++) {
      const dt2 = new DataTransfer();
      dt2.items.add(files[i]);
      pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
      if (i < files.length - 1) await sleep(120);
    }
  }

  // 兼容旧调用名
  async function pasteImage(pm, dataUrl) {
    return pasteAttachment(pm, { imageDataUrl: dataUrl, attachment: { fileName: 'image.png', mime: 'image/png', dataUrl } });
  }

  // 附件插入校验 (2026-10-19 真机复验): 豆包对脚本触发的附件插入一律免疫 —
  // 合成 paste / input.files+change / drop 四条路径实测 composer 都不出现上传预览。
  // 不校验的话，「带图提问」会被当纯文本发出去，模型只能瞎猜 → 静默假成功。
  function composerRoot(pm) {
    return (pm && (pm.closest('form') || pm.parentElement)) || document.body;
  }
  function attachSignature(pm) {
    const root = composerRoot(pm);
    return {
      imgs: root.querySelectorAll('img').length,
      chips: root.querySelectorAll('[class*="upload"],[class*="attach"],[class*="file-item"],[class*="fileItem"]').length,
      text: String(root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  }
  async function waitAttachReady(pm, before, timeoutMs) {
    const t0 = Date.now();
    for (;;) {
      const now = attachSignature(pm);
      if (now.imgs > before.imgs || now.chips > before.chips || now.text !== before.text) return true;
      if (Date.now() - t0 > (timeoutMs || 5000)) return false;
      await sleep(250);
    }
  }
  const ATTACH_REJECTED = '附件未能插入输入框（豆包拒绝脚本触发；请手动附图，或把该条改成纯文本）';

  // 附件条目的文字: execCommand 输入链追加 (不清空编辑器内容)
  function appendText(text) {
    const pm = selectorManager.getInput();
    if (!pm || !text) return;
    pm.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(pm);
      sel.collapseToEnd();
      const hasText = (pm.textContent || '').trim().length > 0;
      if (hasText) document.execCommand('insertParagraph');
      if (!document.execCommand('insertText', false, text)) throw new Error('execCommand rejected');
    } catch (_) {
      try {
        pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        pm.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch (_) {}
    }
  }

  function getRealSendButton() {
    const wrapped = document.querySelector('.send-btn-wrapper button');
    if (wrapped && !wrapped.disabled) return wrapped;
    const byCls = document.querySelector('button[class*="bg-g-send-msg-btn"]');
    if (byCls && !byCls.disabled) return byCls;
    // aria / 文案兜底
    const buttons = document.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.disabled) continue;
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim();
      if (/发送|send/i.test(label) && b.getBoundingClientRect().width > 8) return b;
    }
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

  // 用户气泡选择器统一走 selectorManager（调试面板可覆盖，见 FR-11）
  function userBubbleSel() {
    return selectorManager?.getUserBubble?.() || '[class*="bg-g-send-msg-bubble-bg"]';
  }

  function aiContentSel() {
    return selectorManager?.getAiContent?.() || '[class*="conversation-message-content-padding-right"]';
  }

  function countUserBubbles() {
    return document.querySelectorAll(userBubbleSel()).length;
  }

  function countAssistantBlocks() {
    // 豆包助手块：非用户气泡的消息容器（宽松计数，仅作增长信号）
    const all = document.querySelectorAll('[data-testid*="message"], [class*="message"], [class*="receive"]');
    return all.length || document.querySelectorAll('[data-streaming]').length;
  }

  async function waitSendAck(beforeCount, sentText, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    const start = Date.now();
    // needle 用归一化文本比对 (标点全半角差异 + 虚拟滚动不增计数, 见 normText 注释)
    const needle = normText(sentText).slice(0, 40);
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const bubbles = document.querySelectorAll(userBubbleSel());
        const grew = bubbles.length > beforeCount;
        let matched = false;
        if (needle) {
          for (let i = bubbles.length - 1; i >= Math.max(0, bubbles.length - 5); i--) {
            if (normText(bubbles[i].innerText).indexOf(needle) >= 0) { matched = true; break; }
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

  // 验证码暂停时钟: 暂停期间回复必然不会到达, 这段时长要从等待超时里剔除,
  // 否则「暂停 → 放行」后剩余时间已耗尽, 明明正常的回复会被误判 TIMEOUT。
  function makePauseClock() {
    let pausedMs = 0;
    let since = 0;
    const probe = setInterval(() => {
      const paused = !!(captchaDetector && captchaDetector.isDetected && captchaDetector.isDetected());
      if (paused) { if (!since) since = Date.now(); }
      else if (since) { pausedMs += Date.now() - since; since = 0; }
    }, 300);
    return {
      pausedMs: () => pausedMs + (since ? Date.now() - since : 0),
      isPaused: () => !!since,
      stop: () => clearInterval(probe),
    };
  }

  async function waitReplyDone(timeoutSec) {
    const timeoutMs = (timeoutSec || 180) * 1000;
    const clock = makePauseClock();
    try {
      await waitReplyDoneInner(timeoutMs, clock);
    } finally {
      clock.stop();
    }
  }

  async function waitReplyDoneInner(timeoutMs, clock) {
    // 发送前的助手块快照: 瞬时回复可能在 200ms 轮询间隙完成 (isGenerating 从未观测到 true),
    // 此时用「助手块/文本/节点相对发送前发生变化且稳定 2.5s」判完成, 不强依赖 streaming 标记
    const beforeAssist = countAssistantBlocks();
    const beforeNode = lastAssistantNode();
    const beforeText = normText((beforeNode || {}).innerText || '');
    if (replyState && typeof replyState.whenDone === 'function') {
      try {
        await replyState.whenDone({ timeout: timeoutMs, startTimeout: 20000 });
        return;
      } catch (e) {
        // fall through to bubble-growth fallback
        console.warn('[dwt-batch] replyState.whenDone failed, fallback:', e && e.message);
      }
    }
    // 兜底：streaming 出现再消失, 或助手块/末块文本/末块节点相对发送前变化且稳定 2.5s
    // (虚拟滚动会回收顶部节点, 计数不增; 相同问题二次提问回复文本也相同 → 用节点身份兜底)
    const t0 = Date.now();
    let sawStreaming = !!document.querySelector('[data-streaming="true"]');
    let lastAssist = countAssistantBlocks();
    let lastText = beforeText;
    let grew = lastAssist > beforeAssist;
    let stableSince = Date.now();
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const paused = clock.isPaused();
        const elapsed = Date.now() - t0 - clock.pausedMs();
        const streaming = !!document.querySelector('[data-streaming="true"]');
        if (streaming) {
          sawStreaming = true;
          stableSince = Date.now();
        }
        const node = lastAssistantNode();
        const textNow = normText((node || {}).innerText || '');
        const assist = countAssistantBlocks();
        if (assist !== lastAssist || textNow !== lastText) {
          if (assist > beforeAssist || (textNow && textNow !== beforeText) || (node && node !== beforeNode)) grew = true;
          lastAssist = assist;
          lastText = textNow;
          stableSince = Date.now();
        }
        // 暂停中不做「稳定即完成」判定: 停更只是被验证码挡住, 不是回复结束
        if (sawStreaming && !streaming && !paused) {
          clearInterval(timer);
          resolve();
          return;
        }
        // 见过增长 (streaming 标记可有可无) 且 2.5s 无 streaming / 无增长 → 视为完成
        if (grew && Date.now() - stableSince > 2500 && !streaming && !paused) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (elapsed > timeoutMs) {
          clearInterval(timer);
          reject(new Error('reply timeout (fallback) after ' + timeoutMs + 'ms'));
        }
      }, 300);
    });
  }

  // ---- 回复约束校验 (v3) ----
  // 助手消息块 = 最后一条「不含用户气泡」的 v_list_row；一条消息里会有多个 aiContent 命中，
  // 其中包含「用户提问回显」(无操作栏)，真正回答反而带 message-action-bar —— 所以
  // 不能按操作栏过滤（旧实现的 bug: 把真回答滤掉，reply 字段拿到的是回显文本）。
  function assistantTextNode() {
    const rows = document.querySelectorAll('[class*="v_list_row"]');
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row.querySelector(userBubbleSel())) continue;
      const cands = Array.from(row.querySelectorAll(aiContentSel()))
        .map((n) => ({ n, len: String(n.innerText || n.textContent || '').trim().length }))
        .filter((c) => c.len > 0)
        .sort((a, b) => b.len - a.len);
      if (cands.length) return cands[0].n;
    }
    // 兜底: 行结构变了，退回「最后一个非用户气泡的内容块」
    const nodes = document.querySelectorAll(aiContentSel());
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.closest(userBubbleSel())) continue;
      if (String(n.innerText || n.textContent || '').trim()) return n;
    }
    return null;
  }

  function lastAssistantNode() {
    return assistantTextNode();
  }

  // 正文文本：操作栏文案排在正文之后，按尾部裁剪，避免把「复制/重新生成」并进 reply
  function nodeText(node) {
    if (!node) return '';
    let full = answerText(node);
    const bar = node.querySelector('[class*="message-action-bar"]');
    if (bar) {
      const bt = String(bar.innerText || bar.textContent || '').trim();
      if (bt && full.endsWith(bt)) full = full.slice(0, full.length - bt.length).trim();
    }
    return full;
  }

  // 回答正文 = blockLayout 下的非推荐卡片块（实证 2026-10-19）:
  // 助手内容块内是「块布局」容器 (class 含 blockLayout-)，答案与豆包附加卡片是并列子块；
  // 文字回答「2」后面挂的「相关视频」卡片文案会整段混进 innerText，必须按块剔除。
  const CARD_HEAD_RE = /^(相关视频|相关阅读|相关推荐|相关搜索|推荐阅读|相关文档|猜你想问)/;
  function answerText(node) {
    if (!node) return '';
    const layout = node.querySelector('[class*="blockLayout-"]');
    const host = layout || node;
    const kids = Array.from(host.children);
    if (kids.length > 1) {
      const kept = kids
        .filter((b) => !CARD_HEAD_RE.test(String(b.innerText || '').trim()))
        .map((b) => String(b.innerText || '').trim())
        .filter(Boolean);
      if (kept.length) return kept.join('\n');
    }
    return String(node.innerText || '').trim();
  }

  // 「图片回答」判定: 只有渲染尺寸够大的图才算生成图。
  // 实证: 纯文字回答里「相关视频」卡片带一个 16×16 图标，旧实现 !!querySelector('img')
  // 会把文字回答判成图片回答（replyCheck: 'plain' 因此误报失败）。
  const IMG_MIN_SIDE = 100;
  function hasRealImage(node) {
    if (!node) return false;
    const boxes = node.querySelectorAll('img, [class*="image-container"], [class*="gen-image"], [class*="image-wrapper"]');
    for (let i = 0; i < boxes.length; i++) {
      const r = boxes[i].getBoundingClientRect();
      if (r.width >= IMG_MIN_SIDE && r.height >= IMG_MIN_SIDE) return true;
    }
    return false;
  }

  // 返回 true=满足约束/无约束; false=不满足 (触发 PAUSED_BY_CONSTRAINT)
  // 找不到助手块时按不满足处理 (回复异常, 暂停让用户决定), 避免静默放行。
  function checkReplyConstraint(item) {
    if (!item || !item.replyCheck) return true;
    const node = lastAssistantNode();
    if (!node) return false;
    const hasImg = hasRealImage(node);
    return item.replyCheck === 'plain' ? !hasImg : hasImg;
  }

  // 抓取本条助手回复正文 (供面板 reply/result 字段)
  function captureReplyText() {
    return nodeText(lastAssistantNode());
  }

  class BatchRunner {
    constructor(items, opts) {
      opts = opts || {};
      this.items = items;
      this.minInterval = opts.minInterval || 3;
      this.replyTimeout = opts.replyTimeout || 180;
      this.prefix = String(opts.prefix || '').trim(); // v3: 全局前置词
      // v4: 断点续传 — 从 startIndex 起跑, 此前条目视为已完成
      const startAt = Math.max(0, Math.min(Number(opts.startIndex) || 0, items.length));
      this.index = startAt;
      this.state = 'IDLE';
      this.stopFlag = false;
      this.detached = false; // 被新运行替换后置真: 不再写 window.__dwtBatchStatus
      this.itemStates = items.map((_, i) => ({
        status: i < startAt ? 'DONE' : 'PENDING',
        reply: '',
        result: '',
        reason: '',
      }));
      this._cb = null;
      this._resumeWaiters = [];
      this._onCaptcha = (e) => {
        if (e.detail && e.detail.detected && this.state !== 'PAUSED_BY_CAPTCHA') {
          if (this.index < this.itemStates.length) this._setItem(this.index, 'PAUSED');
          this.state = 'PAUSED_BY_CAPTCHA';
          this._emit();
          try {
            chrome.runtime.sendMessage({ type: 'BATCH_CAPTCHA_DETECTED' }).catch(() => {});
          } catch (_) {}
        }
      };
      if (captchaDetector) {
        captchaDetector.start();
        window.addEventListener('dwt-captcha-change', this._onCaptcha);
      }
    }

    onEvent(fn) { this._cb = fn; }
    _setItem(i, status, extra) {
      if (!this.itemStates[i]) return;
      this.itemStates[i].status = status;
      if (extra && typeof extra === 'object') {
        if (extra.reply != null) {
          this.itemStates[i].reply = String(extra.reply);
          this.itemStates[i].result = String(extra.reply);
        }
        if (extra.result != null && extra.reply == null) {
          this.itemStates[i].result = String(extra.result);
          this.itemStates[i].reply = String(extra.result);
        }
        if (extra.reason != null) this.itemStates[i].reason = String(extra.reason);
      }
    }
    _storeReply(i) {
      const text = captureReplyText();
      if (this.itemStates[i]) {
        this.itemStates[i].reply = text;
        this.itemStates[i].result = text;
      }
      return text;
    }
    _emit() {
      // 被新运行替换掉的旧 runner 不再写全局状态：它退出时会补发一个终态，
      // 会盖掉新 runner 的 RUNNING，让面板误判「本次运行已结束」而停止同步队列
      if (this.detached) return;
      const ev = { state: this.state, index: this.index, total: this.items.length, items: this.itemStates };
      try { window.__dwtBatchStatus = ev; } catch (_) {}
      this._cb && this._cb(ev);
    }

    _resolveResume() {
      const waiters = this._resumeWaiters.splice(0, this._resumeWaiters.length);
      waiters.forEach((fn) => { try { fn(); } catch (_) {} });
    }

    waitForResume() {
      return new Promise((resolve) => {
        this._resumeWaiters.push(resolve);
        const onMsg = (msg, _sender, sendResponse) => {
          if (msg && msg.type === 'BATCH_RESUME') {
            try { chrome.runtime.onMessage.removeListener(onMsg); } catch (_) {}
            window.removeEventListener('dwt-batch-resume', onEvt);
            try { sendResponse({ ok: true }); } catch (_) {}
            this._resolveResume();
            return true;
          }
          return false;
        };
        const onEvt = () => {
          try { chrome.runtime.onMessage.removeListener(onMsg); } catch (_) {}
          window.removeEventListener('dwt-batch-resume', onEvt);
          this._resolveResume();
        };
        try { chrome.runtime.onMessage.addListener(onMsg); } catch (_) {}
        window.addEventListener('dwt-batch-resume', onEvt);
      });
    }

    async run() {
      this.state = 'RUNNING'; this._emit();
      for (; this.index < this.items.length; this.index++) {
        if (this.stopFlag) break;
        const item = this.items[this.index];

        // 空条目 (无文本且无附件): 跳过, 不再无限等放行
        if (!item.text && !hasAttach(item)) {
          this._setItem(this.index, 'SKIPPED'); this._emit();
          continue;
        }

        if (captchaDetector && captchaDetector.isDetected()) {
          this._setItem(this.index, 'PAUSED');
          this.state = 'PAUSED_BY_CAPTCHA'; this._emit();
          await this.waitForResume();
          if (this.stopFlag) break;
          if (captchaDetector.isDetected()) {
            this.state = 'PAUSED_BY_CAPTCHA'; this._emit();
            await this.waitForResume();
            if (this.stopFlag) break;
          }
        }

        // 首条不等待间隔，避免「点开始却卡住 3 秒」
        if (this.index > 0 && this.minInterval > 0) {
          await sleep(this.minInterval * 1000);
        }
        if (this.stopFlag) break;

        this._setItem(this.index, 'SENDING');
        this.state = 'RUNNING'; this._emit();
        const bubblesBefore = countUserBubbles();
        // v3: 全局前置词拼在每条正文前 (图片条目的配文同样生效)
        const fullText = this.prefix ? this.prefix + '\n' + item.text : item.text;
        let sent = false;
        let attachRejected = false;
        for (let attempt = 0; attempt < 2 && !sent; attempt++) {
          if (this.stopFlag) break;
          try {
            if (attempt > 0 && hasAttach(item)) {
              // 附件条目重试：先清空输入区，否则文件会被挂第二遍
              clearComposer();
              await sleep(200);
            }
            if (hasAttach(item)) {
              // 附件条目: 先挂文件到豆包输入区 (原生 file input / paste), 校验真的挂上了再追加文字
              const pm = selectorManager.getInput();
              if (!pm) throw new Error('ProseMirror 输入框未找到');
              const before = attachSignature(pm);
              await pasteAttachment(pm, item);
              const attached = await waitAttachReady(pm, before, 5000);
              if (!attached) {
                const err = new Error(ATTACH_REJECTED);
                err.dwtAttachRejected = true;
                throw err;
              }
              await sleep(200);
              appendText(fullText);
            } else {
              dispatchInput(fullText);
            }
            await sleep(120);
            await clickSend();
            // ack 用「实际发出的文本」(含全局前置词)，否则带前缀时 needle 永远匹配不上
            await waitSendAck(bubblesBefore, fullText, 10000);
            sent = true;
          } catch (e) {
            console.error('[dwt-batch] send failed attempt', attempt + 1, e);
            // 附件被拒是确定性的 (重试同样失败): 直接标失败 + 暂停, 不降级成纯文本发出去
            if (e && e.dwtAttachRejected) {
              this._setItem(this.index, 'FAILED', { reason: ATTACH_REJECTED });
              this.state = 'PAUSED_BY_ATTACH'; this._emit();
              await this.waitForResume();
              attachRejected = true;
              break;
            }
            // ack 超时可能只是检测误报 (虚拟滚动不增计数等), 消息其实已发出 —
            // 复查最近气泡是否已包含本条文本, 命中就按成功处理, 避免重试造成重复发送
            const needle = normText(fullText).slice(0, 40);
            if (needle) {
              const bubbles = document.querySelectorAll(userBubbleSel());
              for (let i = bubbles.length - 1; i >= Math.max(0, bubbles.length - 5); i--) {
                if (normText(bubbles[i].innerText).indexOf(needle) >= 0) { sent = true; break; }
              }
            }
            if (!sent && attempt === 0) await sleep(400);
          }
        }
        if (this.stopFlag) break;
        if (attachRejected) continue;
        if (!sent) {
          this._setItem(this.index, 'FAILED');
          this.state = 'PAUSED_BY_TIMEOUT'; this._emit();
          await this.waitForResume();
          if (this.stopFlag) break;
          continue;
        }

        this._setItem(this.index, 'WAITING');
        this.state = 'WAITING_REPLY'; this._emit();
        try {
          await waitReplyDone(item.timeout || this.replyTimeout);
          const reply = this._storeReply(this.index);
          // v3: 回复约束校验 — 不满足 → FAILED_CONSTRAINT + 暂停, 放行后跳过该条继续下一条
          if (checkReplyConstraint(item)) {
            this._setItem(this.index, 'DONE', { reply });
          } else {
            console.warn('[dwt-batch] reply constraint not met:', item.replyCheck, 'at', this.index);
            this._setItem(this.index, 'FAILED_CONSTRAINT', { reply });
            this.state = 'PAUSED_BY_CONSTRAINT'; this._emit();
            await this.waitForResume();
            if (this.stopFlag) break;
          }
        } catch (e) {
          console.error('[dwt-batch] reply wait failed:', e);
          const reply = this._storeReply(this.index); // 超时也可能已有部分回复
          const isTimeout = !!(e && /timeout/i.test(String(e.message || e)));
          this._setItem(this.index, isTimeout ? 'TIMEOUT' : 'FAILED', { reply });
          this.state = 'PAUSED_BY_TIMEOUT'; this._emit();
          await this.waitForResume();
          if (this.stopFlag) break;
        }
      }
      // v4: 用户中断 → STOPPED (保留 index); 自然跑完 → DONE
      this.state = this.stopFlag ? 'STOPPED' : 'DONE';
      this._emit();
      this._cleanup();
    }

    _cleanup() {
      if (captchaDetector) {
        try { captchaDetector.stop(); } catch (_) {}
      }
      try { window.removeEventListener('dwt-captcha-change', this._onCaptcha); } catch (_) {}
      this._resolveResume();
    }

    stop() {
      this.stopFlag = true;
      this.state = 'STOPPED';
      this._emit();
      this._cleanup();
    }
  }

  window.BatchRunner = BatchRunner;
})();
