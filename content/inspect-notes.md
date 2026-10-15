# 豆包 doubao.com/chat DOM inspect 笔记（2026-10-15）

测试会话：`https://www.doubao.com/chat/38447125136067586`

## 四个核心 selector

| 元素 | 选择器 | 备注 |
| --- | --- | --- |
| 输入框 | `.ProseMirror` | tag=DIV, contenteditable=true, class=tiptap ProseMirror ProseMirror-focused。ProseMirror 内部用 `<p dir="auto">` 段落存文本，直接改 textContent 可能破坏结构，用 innerHTML + InputEvent('input') + Event('change') |
| 发送按钮 | 特征匹配：disabled=false + querySelector('svg')!=null + getBoundingClientRect().top > 550 + 靠右（right 最大） | 无固定 aria-label，无固定 class。靠 bottom-right 位置 + has svg + !disabled 三个特征定位，比写死 class 更稳 |
| 回复中标识 | `[class*="thinking" i], [class*="streaming" i], [class*="loading" i], [class*="typing" i]` | 豆包回复生成时 DOM 里会出现这些 class 的元素；全部消失即回复完成。兜底：回复中 ProseMirror `<p>` 数量在变化 |
| 验证码 | `[class*="captcha" i], [class*="verify" i], [class*="verifycode" i], [id*="captcha" i]` | 目前未在测试会话中触发验证码，selector 来自通用模式；调试面板里覆盖 |

## 已发现的坑

1. **ProseMirror 直接改 textContent 会破坏编辑器状态**：输入框是 contenteditable div，ProseMirror 内部维护一个内部状态树。正确做法是 `pm.innerHTML = '<p dir="auto">文本</p>'` + dispatchEvent InputEvent + dispatchEvent change。
2. **browser_type 工具不认识 contenteditable div**：它只认识 input/textarea，ProseMirror div 会返回"不是 text input"错误。必须用 browser_evaluate 直接操作 DOM 或手动 click 聚焦后 evaluate。
3. **evaluate return 值被 V8 sandbox auto-wrap 再 stringify**：任何 return 出来会是 `[object Object]`，把完整数据打印到 text() 需要让 Exec 外层 stringify。
4. **发送按钮 disabled 状态切换时机**：在输入框写入文本 + 触发 change event 后发送按钮从 disabled=true 变成 false（具体间隔不确定，需用 MutationObserver 或 waitForElement 监听）。
5. **Enter vs Ctrl+Enter 发送**：豆包 Enter 是换行，发送必须点按钮或 Ctrl/Cmd+Enter。默认 runner 用 click() 发送按钮。

## 后续 inspect 任务（TODO）

- [ ] 触发一条豆包回复 → 观察回复中 loading 标识的具体 class 是什么
- [ ] 触发验证码（或用 evaluate 临时注入 `<div class="captcha">test</div>`）→ 验证 captcha-detector 是否捕获
- [ ] 观察回复完成后 loading 元素消失的时机
