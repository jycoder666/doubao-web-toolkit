// Selector registry for doubao.com / dola.com
// NOTE:豆包的 DOM 会随版本变，用户可以在调试面板里覆盖这里的默认值
// 最后 inspect 日期：2026-10-15 页面 https://www.doubao.com/chat

const DEFAULTS = {
  // 输入框 —— ProseMirror (tiptap 编辑器)
  input: '.ProseMirror',

  // 发送按钮 —— disabled=false + 有 svg icon + 在视口底部附近（right 最右）
  // 我们通过特征匹配来选，不是固定 class
  send: {
    match: (btn) => {
      const r = btn.getBoundingClientRect();
      return !btn.disabled
        && btn.querySelector('svg') !== null
        && r.top > 550
        && Math.abs(r.right - window.innerWidth) < 100;  // 靠右
    },
    triggerMode: 'click',   // 'click' | 'enter'  Enter 在豆包里是换行
  },

  // "正在生成回复" —— 豆包回复中会出现 loading / thinking / typing 元素
  // 优先匹配显式 loading 标识；兜底用 "ProseMirror 里有光标闪烁"
  replyState: {
    // 回复"正在生成"的判定：匹配任一 selector 存在则认为仍在生成
    generatingSelectors: [
      '[class*="thinking" i]',
      '[class*="streaming" i]',
      '[class*="loading" i]',
      '[class*="typing" i]',
      '[class*="wait"]',
    ],
    // 兜底：用户回复 ProseMirror contenteditable 中存在的 <p> 数量在变化（流输出）
    fallback: 'content-paragraph-count-changing',
  },

  // 验证码
  captcha: [
    '[class*="captcha" i]',
    '[class*="verify" i]',
    '[class*="verifycode" i]',
    '[id*="captcha" i]',
  ],

  // 会话消息容器（对话导出用）
  messageContainer: '[class*="message" i], [class*="chat-message" i]',
};

export default {
  DEFAULTS,

  // 用 chrome.storage.local 覆盖用户自定义值
  async load() {
    const overrides = await chrome.storage.local.get('dwt_selectors');
    return { ...DEFAULTS, ...overrides.dwt_selectors };
  },

  async save(overrides) {
    await chrome.storage.local.set({ dwt_selectors: overrides });
  },
};
