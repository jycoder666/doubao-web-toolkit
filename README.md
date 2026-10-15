# Doubao Web Toolkit

Chrome/Edge Manifest V3 浏览器扩展，专门服务 doubao.com / dola.com 网页版。

## 功能（MVP 首批）

| 功能 | 状态 |
| --- | --- |
| 调试面板（DOM 选择器 inspect + 实时状态） | ✅ 已实现 |
| 批量输入 + 验证码暂停（用户原创功能） | ✅ 已实现状态机 |
| 对话导出（Markdown 单会话 + JSON 全量） | 🚧 占位，参考 VESTI / AIExporter |
| 对话导航 pill | 🚧 占位 |
| 提示词快捷条 | 🚧 占位 |
| 主题切换 / 自动滚动 / 悬浮按钮 | 🚧 占位 |

功能总览清单（225 条仓库、含合规评级、优先级、实现状态勾选）在根目录：
[豆包插件功能总览_2026-10-15.md](https://github.com/jycoder666/doubao-web-toolkit#)

## 安装（开发模式）

1. `git clone https://github.com/jycoder666/doubao-web-toolkit.git`
2. Chrome 打开 `chrome://extensions` → 开发者模式 → **加载未打包扩展** → 选中本项目目录
3. 打开 `https://www.doubao.com/chat` → 右下角会出现「⚙ DWT」按钮（调试面板开关）
4. 扩展图标右键 → 选项，进入功能开关 + 批量输入模板配置页

## 批量输入（用户原创）

配置入口：选项页 → 批量输入模板（支持 **JSON** 和 **逐行** 两种格式 Tab 切换）

**JSON 格式**：
```json
[
  {"text":"请帮我写一篇关于 AI Agent 的周报","waitType":"reply","timeout":180},
  {"text":"把上一条翻译成英文","waitType":"reply"},
  {"text":"","waitType":"manual"},
  {"text":"总结当前对话的三条结论","waitType":"reply"}
]
```

**逐行格式**（每行一条文本，默认 waitType=reply）：
```
请帮我写周报
把上一条翻译成英文
总结对话结论
```

执行：popup 面板点"运行"，或 options 页保存后在 popup 里启动。**执行中如果检测到验证码会自动暂停**，人工处理完后在 popup 点"继续"。

## DOM 选择器

豆包 DOM 会随版本变化，所有核心选择器都在**调试面板**里可查看/编辑/保存：

| 选择器 | 默认值 | 说明 |
| --- | --- | --- |
| 输入框 | `.ProseMirror` | tiptap contenteditable 编辑器 |
| 发送按钮 | disabled=false + has svg + top>550 + 靠右 | 特征匹配，非固定 class |
| 回复中标识 | `[class*="thinking"],...` | 多个备选 |
| 验证码 | `[class*="captcha"],...` | 多个备选 |

## 合规声明

**本扩展不做以下事情**：
- 去水印 / 无水印下载（违反《AI 生成合成内容标识办法》）
- 免 Token / 网页版逆向 API / 中转反代 / 多账号轮询（违反豆包平台协议与计费规则）
- 自动答题、伪造 AI 水印（违反学术/标识法规）

**本扩展做的**：纯 DOM 层操作，不调用豆包私有 API endpoint；批量输入是单账号、手动触发、无循环的辅助工具。

## 技术栈

- Manifest V3
- 原生 JS + ES Module（`content-loader.js` 动态 import 各 feature 模块）
- 零构建步骤、零 npm install
- chrome.storage.local + IndexedDB
- content.js 长任务，绝不放 background（绕过 MV3 Service Worker 30s 限制）

## 为什么不做油猴脚本

- MV3 更稳定，Chrome 明确支持，扩展商店可发布
- 零构建、零依赖、零权限焦虑——权限声明全部在 manifest.json 里透明
- 油猴脚本依赖宿主扩展，权限和行为不可控

---

> 项目名：**doubao-web-toolkit** ｜ GitHub：[jycoder666/doubao-web-toolkit](https://github.com/jycoder666/doubao-web-toolkit)
