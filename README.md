# Doubao Web Toolkit

Chrome/Edge Manifest V3 浏览器扩展，专门服务 doubao.com / dola.com 网页版。

## 功能（MVP 首批，全部可运行）

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 调试面板 | ✅ | 右下角⚙按钮 → 选择器表 + 实时状态（replyState / captcha）+ 元素选择模式 |
| 批量输入 + 验证码暂停 | ✅ | **用户原创**：JSON / 逐行两种配置 → 状态机逐项发送 → 验证码无限暂停 → 人工放行继续 |
| 对话导出（Markdown + JSON） | ✅ | popup 一键导出，自动收集对话 DOM，Blob 下载 |
| 对话导航 pill 条 | ✅ | 左侧悬浮导航，收集用户问题气泡，点击 scrollIntoView |
| 提示词快捷条 | ✅ | 右下角快捷按钮栏，点击写入 ProseMirror |
| 主题切换（深色/浅色） | ✅ | 注入 dark CSS，storage 持久化 |
| 自动滚动 + 悬浮⬇按钮 | ✅ | MutationObserver 监听新回复，用户接近底部时自动滚 |
| 联网来源标注 | 🚧 占位 | 豆包回复的来源 DOM 结构未确认，待观察后实现 |

功能总览清单（225 条仓库、合规评级、优先级、impl 勾选）：
[豆包插件功能总览_2026-10-15.md](https://github.com/jycoder666/doubao-web-toolkit#)

## 安装（开发者模式）

1. `git clone https://github.com/jycoder666/doubao-web-toolkit.git`
2. Chrome 打开 `chrome://extensions` → 右上角开发者模式 → **加载已解压的扩展程序** → 选中本项目目录
3. 打开 `https://www.doubao.com/chat`
4. 页面上会出现：
   - 右下角「⚙ DWT」蓝色按钮 → 点开调试面板
   - 右下角「提示词」快捷条
   - 左侧「📍 导航」条
   - 左下角「⬇」悬浮按钮
5. 扩展图标点开 = popup（批量输入开始/停止/放行 + 导出 Markdown/JSON）
6. 扩展图标右键 → 选项 = 配置页（功能开关 + 批量输入模板）

## 批量输入（用户原创）

配置入口：**选项页** → 批量输入模板（**JSON** 和 **逐行** Tab 切换）

**JSON 格式**：
```json
[
  {"text":"请帮我写一篇关于 AI Agent 的周报"},
  {"text":"把上一条翻译成英文"},
  {"text":"","waitType":"manual"},
  {"text":"总结当前对话的三条结论"}
]
```

**逐行格式**（每行一条，默认 waitType=reply）：
```
请帮我写周报
把上一条翻译成英文
总结对话结论
```

执行：popup → ▶ 开始执行 → 逐条输入发送 → 等回复（`data-streaming="false"`）→ 下一条。
**检测到验证码自动无限暂停**，人工处理完后点 popup 里 ⏩ 放行 / 继续。

## DOM 选择器（2026-10-16 豆包页面实测）

| 选择器 | 默认值 | 说明 |
| --- | --- | --- |
| 输入框 | `.ProseMirror` | tiptap contenteditable 编辑器 |
| 发送按钮 | 优先 `bg-g-send-msg-btn-bg`，兜底特征匹配 | 输入框空时发送按钮不存在，用 `waitForSend()` 200ms 轮询 |
| 回复中标识 | `[data-streaming="true"]` | 豆包用 data-streaming 属性，不用 thinking/streaming class |
| 验证码 | `[class*="captcha"], [class*="verify"]...` | 多 selector 兜底 |

所有选择器在**调试面板**里可查看/编辑/保存到 storage。

## 合规声明

**不做**：
- 去水印 / 无水印下载（违反 AI 标识办法）
- 逆向豆包 API / 中转反代 / 多账号轮询（违反平台协议与计费规则）
- 自动答题 / 伪造 AI 水印

**做的**：纯 DOM 层操作，零豆包 API 调用；单账号、手动触发。

## 技术栈

- Manifest V3（MV3 content scripts **不支持 ES Module**，全文件用传统 IIFE + `window.dwt` 全局命名空间）
- 零构建、零 npm install、直接加载
- chrome.storage.local + （预留）IndexedDB
- 核心路径全部在 content scripts（绕过 MV3 Service Worker 30s 生命周期限制）

## 为什么不做油猴脚本

- MV3 原生支持更稳定
- 权限声明透明（manifest.json）
- 不依赖宿主扩展的权限系统

---

> 项目名：**doubao-web-toolkit** ｜ GitHub：[jycoder666/doubao-web-toolkit](https://github.com/jycoder666/doubao-web-toolkit)
