# Doubao Web Toolkit

Chrome/Edge Manifest V3 浏览器扩展，专门服务 doubao.com / dola.com 网页版。

## 功能（MVP 首批，全部可运行）

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 调试面板 | ✅ | 右下角⚙按钮（或弹窗「调试面板」）→ ① 可折叠「使用说明」；② DOM 选择器表：直接编辑并「保存」到 `dwt_selectors`，无需改代码，「重置」恢复默认；③ 实时状态（replyState / captcha）；④ 「元素选择模式」：悬停高亮 → 点击元素自动生成 CSS 选择器 → 复制并回填到所选字段，ESC 退出 |
| 批量输入 + 验证码暂停 | ✅ | **用户原创**：JSON / 逐行两种配置 → 状态机逐项发送 → 验证码无限暂停 → 人工放行继续 |
| 对话导出（Markdown + JSON） | ✅ | popup 一键导出，自动收集对话 DOM，Blob 下载 |
| 对话导航 pill 条 | ✅ | **右侧**悬浮导航（避开左侧 280px 会话栏），收集用户问题气泡，点击 scrollIntoView |
| 提示词快捷条 | ✅ | 右下角快捷按钮栏，点击写入 ProseMirror |
| 主题切换（深色/浅色） | ✅ | 注入 dark CSS，storage 持久化 |
| 自动滚动 + 悬浮⬇按钮 | ✅ | MutationObserver 监听新回复，用户接近底部时自动滚 |
| 联网来源标注 | ✅ | 扫描 AI 回复外链 → 解包 `link.wtturl.cn` 跳转 → 域名可信度分级（高/中/低）→ 回复旁挂「🔗 来源 N」徽标，点击展开来源面板 |
| 输入增强（Enter 换行） | ✅ | Enter 换行 / Ctrl(⌘)+Enter 发送；记录最近使用的模型名（`dwt_last_model`） |
| 对话管理（批量清理） | ✅ | 左侧会话列表注入复选框 → 全选/反选 → 批量删除（模拟点击豆包自带菜单，删除前二次确认，默认关闭） |
| 阅读位置标记 | ✅ | 按会话记录阅读位置（消息序号 + 文本指纹双定位，抗重渲染），重开会话时顶部提示「📌 上次读到第 N 条」+「跳回该条」；点击「跳回该条」/「×」或提示自动淡出后即落盘当前位置，刷新不再重复弹出 |
| 对话摘要 / 提纲 | ✅ | 本地抽取对话生成 Markdown 提纲（轮次/条数/字数统计 + 每轮问答要点），支持复制与下载，零网络请求（默认关闭） |
| 划词语料 / 高亮 | ✅ | 对话区划词浮层「收藏 / 高亮」+ 右下角语料板 + 公式悬停复制 LaTeX；**豆包原生选区菜单已含复制，DWT 选区工具栏不再提供复制以免重复** |
| 对话目录搜索 | ✅ | 导航条顶部搜索框，按关键词实时过滤提问目录项 |
| 开发热重载 | ✅ | **仅开发用（默认关闭）**：改动源码后自动重载扩展 + 刷新已打开的豆包页面，无需手动去 `chrome://extensions` 点「重新加载」 |

功能总览清单（225 条仓库、合规评级、优先级、impl 勾选）：
[豆包插件功能总览_2026-10-15.md](https://github.com/jycoder666/doubao-web-toolkit#)

## 安装（开发者模式）

1. `git clone https://github.com/jycoder666/doubao-web-toolkit.git`
2. Chrome 打开 `chrome://extensions` → 右上角开发者模式 → **加载已解压的扩展程序** → 选中本项目目录
3. 打开 `https://www.doubao.com/chat`
4. 页面上会出现：
   - 右下角「⚙ 调试」蓝色按钮 → 点开调试面板
   - 右下角「提示词」快捷条
   - 右侧「📍 导航」条
   - 左下角「⬇」悬浮按钮
   - AI 回复旁的「🔗 来源 N」徽标（联网来源标注）
   - 开启「对话管理」后，左下角出现「🗂」入口按钮
   - 开启「对话摘要」后，右下角出现「🧾」入口按钮
5. 扩展图标点开 = popup（批量输入开始/停止/放行 + 导出 Markdown/JSON + 来源标注/对话管理/阅读标记/对话摘要 开关）
6. 扩展图标右键 → 选项 = 配置页（6 个功能开关 + 批量输入模板）
7. **每个工具开关都带「ⓘ」提示**：配置页悬停功能名后的 `ⓘ`、弹窗悬停工具按钮，即可看到该开关**开启后会发生哪些变化**（分点说明），无需试错

## 开发热重载（改代码免手动刷新）

默认关闭。**开发时**在配置页 → 「开发」→ 勾选「开发热重载」并保存，即可：

- 每 1.5 秒对扩展自身源码文件做一次内容指纹比对；
- 检测到任意源码文件被保存/修改后，**自动刷新所有已打开的豆包标签页**，并**自动重载扩展本身**；
- 无需再手动去 `chrome://extensions` 点「重新加载」，也无需手动刷新页面。

实现：`background/hot-reload.js`（零依赖）。原理是 MV3 没有「文件变化」事件源，故用
`chrome.runtime.getPackageDirectoryEntry()` 直读磁盘文件（回退 `fetch(no-store)`）计算
FNV-1a 指纹轮询比对；因 MV3 Service Worker 约 30s 空闲即被终止，模块内置 20s 保活心跳
（调用 `chrome.runtime.getPlatformInfo`）以维持轮询。

> 注意：开启后会周期性读取扩展文件，属开发用途，**正式使用请保持关闭**。

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

执行：popup → ▶ 开始批量发送 → 逐条输入发送 → 等回复（`data-streaming="false"`）→ 下一条。
**检测到验证码自动无限暂停**，人工处理完后点 popup 里 ⏩ 验证码已处理，继续下一条。

## DOM 选择器（2026-10-16 豆包页面实测）

| 选择器 | 默认值 | 说明 |
| --- | --- | --- |
| 输入框 | `.ProseMirror` | tiptap contenteditable 编辑器 |
| 发送按钮 | 优先 `bg-g-send-msg-btn-bg`，兜底特征匹配 | 输入框空时发送按钮不存在，用 `waitForSend()` 200ms 轮询 |
| 回复中标识 | `[data-streaming="true"]` | 豆包用 data-streaming 属性，不用 thinking/streaming class |
| 用户消息 | `[class*="bg-g-send-msg-bubble-bg"]` | |
| AI 回复 | `[class*="conversation-message-content-padding-right"]` | 来源标注以该容器为根扫描外链 |
| 验证码 | `[class*="captcha"], [class*="verify"]...` | 多 selector 兜底 |
| 侧栏会话项操作按钮 | `[data-sidebar-item-actions="true"]` | **hover-only**（默认 opacity:0），需先派发 `mouseover` 触发渲染 |
| 外链跳转包装 | `link.wtturl.cn/?target=<urlencoded>` | 豆包把所有 AI 回复外链包了一层跳转，取真实域名须解包 `target` 参数 |

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

## Cursor 内置浏览器（无法装扩展）

内置浏览器不能加载 MV3 扩展，开发时靠本地静态服 + 页面注入：

1. 仓库根目录启动：`python dev/serve.py`（`http://127.0.0.1:5179`，已开 CORS / Private Network）
2. **Glass 自动注入（推荐）**：Cursor `main.js` `did-finish-load` + `webContents focus` → `injectDwtLiveBootForState`；`preload-browser.js`（`dwt-glass-inject`）在 `DOMContentLoaded` / `pageshow` / `focus` / `visibilitychange` 也会 fetch+eval `live-boot.js`（半截 boot / 缺 ⚙·提示词·导航时 incomplete-retry）。补丁：`python dev/_patch_cursor_dwt_inject.py`。**补丁后必须重启 Cursor 一次**，已有 BrowserView 才会加载新 main/preload；之后点回已有豆包页即可触发 inject，不必依赖 MCP。
3. 手动兜底：CDP `Runtime.evaluate` 插 `<script src="http://127.0.0.1:5179/dev/live-boot.js">`。
4. 预览弹窗与豆包页靠 `/dev/bridge/bus` + `/dev/bridge/storage` 互通（`chrome-mock.js`，短轮询 `wait=0`）。
5. **验收前请确认**：Cursor Settings → **Browser Automation = Browser Tab ON** → **补丁后重启 Cursor 一次** → 点回**已有**豆包 chat（或 F5；勿新开第二个相同 URL）。MCP `browser_tabs` 为空时：只做 code/serve，等用户已有标签变为 MCP 可见。验收灯塔：`GET http://127.0.0.1:5179/dev/bridge/verify`（需真实 `doubao.com/chat` href + `toggle`+`promptBar`+`nav`，非 probe）。

---

> 项目名：**doubao-web-toolkit** ｜ GitHub：[jycoder666/doubao-web-toolkit](https://github.com/jycoder666/doubao-web-toolkit)
