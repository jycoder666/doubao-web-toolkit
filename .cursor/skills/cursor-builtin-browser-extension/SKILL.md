---
name: cursor-builtin-browser-extension
description: >-
  Embeds the same Chrome/Edge MV3 extension content scripts into Cursor's
  built-in browser (Glass) — and Trae's built-in browser — for live host-page
  testing. Use when the user asks to test an extension inside Cursor/Trae
  browser, inject live-boot / chrome-mock, debug doubao-web-toolkit (or
  similar) on a real site without loading unpacked extensions, or when
  preload-browser.js / Private Network Access blocks script loading from
  127.0.0.1. Trae path needs NO main-process patch: inject via
  browser_evaluate fetch+eval (see Trae 内置浏览器篇). Also use when
  Glass tab turns solid gray/white after inject or browser automation
  (often browser_lock left locked — unlock first). Use when refresh no
  longer auto-injects after Cursor upgrade (main.js patch wiped — short
  wait-quit repatch path, do not long-debug). Use when serve must stay
  up after Cursor quit (detached bat/ps1) or when porting live-boot to
  another repo and generating open-serve-detached / gen-serve-detached
  startup scripts.
---

# Cursor 内置浏览器嵌套扩展（经验技能）

> 最后更新：2026-10-29（**v3.27**：ZCode IAB 真·自动注入落地——CronCreate 定时自动化每 2 分钟检查豆包页、缺件自动补注入（含 serve 自动重启）；真踩幂等守卫坑：`__dwtLiveBoot` 必须在 fetch 成功后才置 true，否则 serve 挂时守卫假置位、后续注入全被拦 · **v3.26**：划词注入根治——`selection-tools/module.js` 增加 `S._explicitEnabled` 标志，`setEnabled(true)` 时设置、`loadStore()` 检查后不再覆盖为 false；书签小程序改用 `setInterval` 轮询 30 秒，端到端验证全部 UI 通过 · **v3.25**：ZCode IAB 内置浏览器自动注入流程固化——`tab.playwright.evaluate` fetch+eval + 划词长轮询覆盖 `loadStore()` 异步覆盖 + 桌面布局 CSS 修复（豆包 `sm:fixed` 未加载）+ 书签小程序半自动注入 · **v3.24**：IAB 真机调试确认——`dev/inject.js` / `dev/verify.js` / `dev/fixture.html` **均不存在**于仓库，本技能多处引用需标注；`window.dwtInject` API 不可用，实际注入入口是 `live-boot.js`；`#dwt-snip-toggle` 不出现时先查 storage `dwt_selection_tools` 键——`false` 时 `ensureToggle()` 不挂 rail 入口属预期行为；docs 副本与 user 副本此前不同步，本次已对齐 · **v3.23**：serve **必须与 Cursor 进程脱钩**——Agent/终端里起的 `serve.py` 会随 Cursor 退出而死，表现为「重启又不注入」；用 detached 启动脚本 + 崩溃重启环；移植项目时按模板生成对应 bat/ps1 · **v3.22**：Cursor **升级会冲掉 main.js 注入补丁**——刷新豆包不再自动挂插件；Agent 禁止长排查，按「30 秒探针 → wait-quit 重打」短路径执行，省 token · **v3.21**：Glass **整页灰屏/白屏优先查 `browser_lock` 未解锁**——Cursor 交互遮罩，不是插件 CSS；lock 后必须 finally unlock；工具中断/超时/子代理被打断时仍须 unlock；用户报灰屏禁止先怪 vibe/CSS 空耗数小时 · **v3.20**：说明文本表格化轮（DWT 面板说明改分节表格，30 项验收）—— 两条可迁移教训：① **宽弹层的边界夹取必须按实测宽度算**：默认 320px 的 tip 加了自定义宽度（470）之后，定位里写死的 `innerWidth - 340` 就不够了（真机：tip 右边缘被推出视口），改成 `el.offsetWidth || 320`；② **深色下品牌强调色要就地提亮**：`#2d72de` 压在深色表底 `#1f2430` 上实测只有 **3.38:1**（读不清），按导航栏同套 `#7fb0ff` 就地覆盖后 **7.06:1** —— 共享变量 `--dwt-accent` 不动，改在组件选择器里挂 `html.dwt-ui-dark` 前缀；③ **说明表格要自己带色、且提亮可能被行内色压住**：`table/td/summary` 不在深色 `div` 批处理里（写死 `#444` = 1.6:1），元素带行内 `color` 时深色规则不写 `!important` 接不上（实测 3.05:1 → 6.37:1）；另：结构化文案一律 `createElement` + `textContent`（禁 `innerHTML`），**数据/可编辑浮层保持文本模式**，表格化最容易顺手丢信息（验收要逐条钉住分节与键位字段）；测深色**别手改类名** —— 幂等 observer 会立刻纠正回宿主信号，要改真信号 `html[data-theme]`；**v3.19**：面板拖拽轮（DWT 九面板可拖 + 位置记忆，29 项验收）—— 三条可迁移教训：① **serve 缓存键必须是 `(mtime, size)`**：本机出现过「文件内容已改、mtime 没变」，页面一直吃旧副本（现象极坑：served bundle 里**有**新注释、**没有**新调用行，怎么重注入都不生效）；② **跨重注入的监听必须能摘干净**：重注入新建模块实例（实例内 `bound` 注册表是空的），只按实例内 Map 摘不掉上一实例的 handler（两个 handler 同拖一个元素、各自落盘 → 面板「自己跳回旧位置」），绑定要同时记在元素上（`el.__dwtDragBound`）+ `owns(el, b)` 判归属；③ **落盘禁止整份写回**：`set({[KEY]: map})` 在并存实例下会把旧快照写回去（真机：存储里 `725,656` 而 DOM 在 `4,4`，别的面板的键直接从存储里消失），必须读-改-写、只合并本次改过的键（`dirty` Set）；另：**复用/hot-reload 早退分支要重挂把手**（batch 同 rev 复用、snip `_ready` 早退、conv `buildBar()` 复用三处同型，抽 `bindDrag()` 两边都调）；**v3.18**：背景氛围修复（背景层必须**沉底** `z-index:-1` + `pointer-events:none`；**禁** `body > *` 抬层级、**禁**全局强制正文色、**禁** `[class*="sidebar"]`/裸 `aside` 这类宽泛选择器 —— 只刷 `#root`/`#chat-route-layout`/`#chat-route-main`/`main`/聊天滚动容器等稳定容器；浅/深两档压罩（浅 `rgba(255,255,255,.72)` ↔ 深 `rgba(6,12,20,.42)` 挂 `html.dwt-ui-dark`）；预设色板挂 rail 自定义行（`addCustomRow`/`removeCustomRow`，菜单内点击不收起）；开关与预设都必须落盘、**先画再存**）与 28 项验收（+背景氛围不变量）；v3.17：内置导航栏返工 —— 豆包原生 `aside[class*="gutter"]` 轨道**直接承载** `#dwt-gutter-labels`（定位模型保持豆包原样、空档 `pointer-events:none` 点透），自定义 `#dwt-nav` 隐藏；**三条红线**：禁 `padding !important` 覆写 `[class*="w-34"]`（压掉豆包内联 `padding-top/bottom: 388px` 居中 → 刻度挤栏顶小簇）、藏刻度必须 `> div:not(#dwt-gutter-labels)`（一刀切连自家卡片一起藏 → 白屏 0×0）、观察器必须过滤自身记录（自激 → 渲染进程 119% CPU → IAB `tabs list` 30s 超时）；**改样式必升 `NAV_REV`**（同 rev 重注入短路））与 27 项验收（+内置导航栏不变量）；v3.16：外观跟随（**只读宿主自己的外观信号** `html[data-theme]` → `localStorage['dbx-web-theme']` → 页面亮度，系统偏好仅最后兜底）与 26 项验收（+外观跟随不变量、+双 bundle 内联 manifest CSS）；**dev 链从不加载 manifest 的 `content_scripts[].css`** —— serve 现把 CSS 内联成 `<style id="dwt-common-css">` 打进双 bundle（否则 `--dwt-*` 变量全解析成空串）；JS 平行配色（导航条 `.dwt-nav-dark`）不随 CSS 变量翻转，须由 `dwt:themechange` 事件重算；v3.15：回复大纲（右侧固定目录：真实 `h1~h6` 抽取 / 无标题不显示且不补伪大纲 / 跳转走内部滚动容器）与 24 项验收（+回复大纲不变量）；新增「新模块接线 6 处」清单——漏 `live-boot.js` 的 `NEED_MODULES` 会让完整性闸门失效；v3.14：快捷回复分组改造（单按钮 + 滑出分组面板 + 面板内编辑，容器 id/命名空间保留）与 23 项验收（+快捷回复不变量、+存储里快捷回复配置自洽回归）；v3.13：批量多任务（`dwt_batch_tasks_v1` 索引 + `dwt_batch_task_q_<id>` 每任务键 + 单运行门控）与 21 项验收；v3.12：serve 5179「UI 消失≠补丁丢」· `navMode=gutter-css` 时 `#dwt-nav` 隐藏属预期 · 整窗重刷防复发（StartTime 滤 log / 偶发 remount≠inject）· 批量面板同 rev 禁整拆 · 临时恢复只拉 live-boot；v3.11：默认关 3s sweep；v3.10：gutter 误报闸门；Restart gate 仅 StartTime vs mtime；v3.9：宿主 DOM 安全；v3.8：Trae；v3.7：BOOT_JS 防砖机）**dev 链从不加载 manifest 的 `content_scripts[].css`** —— serve 现把 CSS 内联成 `<style id="dwt-common-css">` 打进双 bundle（否则 `--dwt-*` 变量全解析成空串）；JS 平行配色（导航条 `.dwt-nav-dark`）不随 CSS 变量翻转，须由 `dwt:themechange` 事件重算；v3.15：回复大纲（右侧固定目录：真实 `h1~h6` 抽取 / 无标题不显示且不补伪大纲 / 跳转走内部滚动容器）与 24 项验收（+回复大纲不变量）；新增「新模块接线 6 处」清单——漏 `live-boot.js` 的 `NEED_MODULES` 会让完整性闸门失效；v3.14：快捷回复分组改造（单按钮 + 滑出分组面板 + 面板内编辑，容器 id/命名空间保留）与 23 项验收（+快捷回复不变量、+存储里快捷回复配置自洽回归）；v3.13：批量多任务（`dwt_batch_tasks_v1` 索引 + `dwt_batch_task_q_<id>` 每任务键 + 单运行门控）与 21 项验收；v3.12：serve 5179「UI 消失≠补丁丢」· `navMode=gutter-css` 时 `#dwt-nav` 隐藏属预期 · 整窗重刷防复发（StartTime 滤 log / 偶发 remount≠inject）· 批量面板同 rev 禁整拆 · 临时恢复只拉 live-boot；v3.11：默认关 3s sweep；v3.10：gutter 误报闸门；Restart gate 仅 StartTime vs mtime；v3.9：宿主 DOM 安全；v3.8：Trae；v3.7：BOOT_JS 防砖机）

**DWT 仓库专项 playbook（一句话触发即跑完）**：见同名技能的仓库副本
`doubao-web-toolkit/.cursor/skills/cursor-builtin-browser-extension/SKILL.md`
（本机：`D:\other\doubao-web-toolkit\.cursor\skills\cursor-builtin-browser-extension\SKILL.md`）。
对外技能名唯一：`cursor-builtin-browser-extension`（旧名 `glass-dwt-inject-accept` 已废弃）。
docs 本文件与 `%USERPROFILE%\.cursor\skills\cursor-builtin-browser-extension\SKILL.md` **须保持一致**（硬闸/Trae/经验全文）；仓库副本侧重 DWT 注入验收操作手册，stopbleed 闸门须对齐。

用户说「将某插件注入某域名，刷新内置浏览器就能看到」→ 跟仓库副本 end-to-end（preflight + **是否需重启 Cursor** + verify）。

要点：MCP ghost tabs、无 MCP 的 main 补丁扫 WC、ESM `require` 静默失败、BOOT_JS `\n`→`fromCharCode(10)`、**5179 常开 / live-boot 200**、Origin/UA verify beacon、**Restart gate（仅 StartTime vs main/preload mtime）**、gutter-css 藏 `#dwt-nav` 属预期、批量面板同 rev 不重挂。

## 核心结论

Cursor **内置浏览器不能安装** Chrome 扩展。正确做法不是另做一套 UI，而是：

1. 本机 HTTP 服务暴露扩展源码目录  
2. 在目标站点页面注入 `live-boot.js`  
3. 按 `manifest.json` 的 `content_scripts` **同一顺序**加载同一批脚本 + 样式  
4. 用 `chrome-mock.js` 填补页面里没有的 `chrome.*` API  

验收标准：页面上的按钮 / 导航 / 交互来自扩展那批 content scripts，不是临时 DOM。

参考实现仓库：`doubao-web-toolkit`（`dev/serve.py`、`dev/live-boot.js`、`dev/chrome-mock.js`）。  
项目文档：`docs/projects/doubao-web-toolkit/devops/ui-preview.md`、`pause-2026-10-16.md`。

---

## 硬闸（违反即做错题）

用户说「内置浏览器调试 / Glass / 嵌入插件」时：

1. **禁止** `Start-Process chrome.exe`、`--load-extension`、`--remote-debugging-port`、Puppeteer 另起 Chrome 作为「验收替代」  
2. **禁止** 为图快画临时 `#dwt-nav` / 临时按钮冒充插件  
3. **必须先**确认 MCP 命名空间 `cursor-ide-browser` 可用（`browser_tabs` / `browser_cdp`）。不可用或 list 无豆包 tab 时：**停手报告**；只修 inject/serve/补丁/文档，**禁止**用 `open_resource` / `browser_tabs` `new` / `browser_navigate` 代开豆包页——不要改走外开 Chrome  
4. 「已解压扩展是否真注入」是 **Chrome 本机** 验收项；与 Glass 链路分立。Glass 验收通过 ≠ 已解压扩展已确认；反之亦然。不要用外开 Chrome 冒充 Glass 验收  
5. **Tab rule（硬闸 · 禁止自动打开新的豆包页面）**：  
   - **绝对禁止** Agent 对 `https://www.doubao.com/chat/*` 调用 `browser_tabs` `new`、`open_resource`、或会创建/落到新豆包页的 `browser_navigate`。  
   - **即使用户要求「全程自动 / 零参与 / 自己刷新注入」**：也**只**对 **MCP 已可见的已有**豆包标签做 lock → reload / CDP inject；**不得** new / open 同 URL 或任意豆包 chat。  
   - **必须**先 `browser_tabs` list（或 last-interacted，省略 `viewId`）→ 命中已有豆包 chat → **只 `browser_lock` 该 tab** → 之后一切操作（交互 / CDP / `live-boot` 注入）都在这一个 tab 上完成。  
   - 插件不完整时：只在该已有 tab 上 `Page.reload` / CDP fetch+eval `http://127.0.0.1:5179/dev/live-boot.js`——**禁止**为补注入再开一份。  
   - list 若出现**同一 chat URL 的重复标签**：关掉多余的，**只保留一个**，再 lock 留下的那一个。  
   - **若 list 为空 / 无豆包 chat 可见**：**停手**。不打开豆包；等用户侧已有标签变为 MCP 可见后再 lock。**不再有「允许新建一次」例外。**
6. **`browser_lock` 解锁硬闸（2026-10-23 血泪 · 用户干等数小时）**：  
   - **现象**：整页均匀灰/白、豆包 UI「没了」，像插件把页面盖死。真因常是 Cursor Browser Automation 的 **lock 交互遮罩**，不是 DWT vibe/CSS。  
   - **必须**：凡 `browser_lock({action:"lock"})` 成功后，**同一回合结束前**调用 `browser_lock({action:"unlock"})`（同一 `viewId`）。推荐顺序：`list → lock → 注入/CDP/截图 → unlock`。  
   - **必须**：工具报错、超时、用户打断、子代理 interrupt、提前 `return` / `STOP` 时，**仍先 unlock 再停手**——漏 unlock = 用户页面一直灰。  
   - **禁止**：lock 后开长流程却不 unlock；把「灰屏」默认归因于 vibe / `body>*` / serve，却**不先 unlock 试一次**。  
   - **用户说灰屏/白屏时首步（≤30 秒）**：对已有豆包 tab `browser_lock unlock` → 再截图/CDP 确认；灰罩消了就结案汇报「锁未解」，**禁止**轻描淡写「好了」而不说明根因。灰罩仍在才查插件 CSS。  
   - **禁止**：多标签并行 lock 不配成对 unlock；结束对话前不检查是否仍有 lock。

---

### 启用 `cursor-ide-browser`（用户侧，Agent 无法代开）

该 MCP 是 Cursor **内置**能力，**不会**出现在 `~/.cursor/mcp.json` 的第三方列表里，也不要用 `npx` 装外部 browser 包冒充。

1. **Cursor Settings → Tools & MCP → Browser Automation**  
   - 打开开关；下拉选 **Browser Tab**（不要只开到半连接状态）  
2. 关掉再打开一次该开关（约 10 秒），然后 **完全退出并重启 Cursor**（不只 Reload Window）  
3. **新开一条 Agent 对话** 再跑验收（旧会话常仍看不到 `cursor-ide-browser`）  
4. Agent 自检：`GetDynamicTools` 能命中 `browser_tabs` / `browser_cdp`；若仍报 `namespace not found` / `MCP server does not exist`，重复 1–3，并确认 Cursor 已更新  

`open_resource` 只能打开 Glass 标签，**不能**代替 `browser_cdp` 探测/`Runtime.evaluate`。启用前页面级验收一律算未完成。

**2026-10-17 实测**：多次 `open_resource(https://www.doubao.com/...)` 后，本机 `serve.py` **零次** `GET /dev/live-boot.js`——说明该入口未必创建带 `preload-browser.js` 的 BrowserView，或只复用了未重载 preload 的旧视图。解法（遵守 Tab rule）：若 list 里**已有**豆包 chat 标签 → **只 lock 该 tab** 并刷新 / `browser_cdp` 补 `live-boot.js`；**禁止**再 `open_resource` / `new` / `browser_navigate` 到豆包。若 list **没有**豆包 chat：**停手**，不代开。可选：`live-boot` 会 POST `/dev/bridge/verify`，Agent 可轮询该端点取证（仍须先有真正注入）。

---

## 何时启用本技能

- 用户要在 Cursor 内置浏览器里打开真实站点并带上插件功能  
- `window.dwt` / 扩展浮层不出现，需要排查注入链路  
- 提到 `live-boot`、`5179`、`preload-browser.js`、Private Network、Glass 浏览器  

---

## 标准链路（三件套）

```text
python dev/serve.py  →  http://127.0.0.1:5179
        ↓
browser_tabs list
        ├─ 有豆包 chat → 只 lock 该 tab（禁止 new / open_resource / navigate 开豆包）
        └─ 无豆包 chat → 停手；只修 inject/serve；等待已有标签 MCP 可见
        ↓
注入 live-boot.js（preload / 刷新优先，否则对该 tab browser_cdp Runtime.evaluate）
        ↓
chrome-mock.js → 按 manifest 顺序加载 content scripts → 页面出现扩展 UI
```

### 1. 静态服务（必须一直开着 · 且与 Cursor 脱钩）

联调必须保持 `python dev/serve.py`（仓库根）。**serve 挂了 → UI「消失」≠ 补丁丢 / ≠ 要重打 main / ≠ Restart gate**——先查 live-boot 200。

```bash
python dev/serve.py
```

#### 为何「关掉 Cursor 后再开又不注入」（2026-10-23）

| 启动方式 | Cursor 完全退出后 |
| --- | --- |
| Agent / Cursor 集成终端里 `python dev/serve.py` | **常一起死** → 5179 拒绝连接 → 主进程 stub 即使 `ok:true` 也拉不到 live-boot → 看起来像没注入 |
| **独立 cmd 窗口** / `open-serve-detached.bat` | **还活着** → 刷新仍自动注入 |

补丁在 `main.js` 上，退出 Cursor **不会**丢掉（除非升级覆盖）。用户说「重启又不注入」时：**先查 5179 是否 200**，再查补丁标记。

#### DWT 仓库现成脚本（优先用）

| 脚本 | 作用 |
| --- | --- |
| `dev/open-serve-detached.bat` | `start` 新开一个**独立**控制台跑 serve，调用方立刻返回（可从 Cursor 终端点一次） |
| `dev/start-serve-detached.bat` | 独立窗口内跑 `serve.py`，退出则 ~2s 后自动重启（用 `ping` 休眠，避免 Agent 下 `timeout` 报错） |
| `dev/gen-serve-detached.ps1` | **移植生成器**：给其他仓库一键写出上面三份脚本 |
| `dev/start-serve-detached.ps1` | 同上 PowerShell 版（可改端口 / ProbePath） |

用户日常：双击 `open-serve-detached.bat` → 保持弹出的黑窗 → 随便开关 Cursor → 刷新豆包即可。

#### 移植到其他项目时 · Agent 必须生成对应启动脚本

用户说「移植 / 别的仓库也要自动注入 / 生成启动脚本」时，**禁止只口头说「常开 serve」**——必须落盘 bat/ps1。

**优先用生成器**（把 DWT 的 `dev/gen-serve-detached.ps1` 拷到目标仓，或本仓直接带参跑）：

```powershell
powershell -NoProfile -File dev\gen-serve-detached.ps1 `
  -ProjectName MyExt -Port 5179 -ServeRel "dev\serve.py" -ProbePath "/dev/live-boot.js"
```

写出：`open-serve-detached.bat` / `start-serve-detached.bat` / `start-serve-detached.ps1`。  
占位替换示例（DWT）：`ProjectName=DWT`，`Port=5179`，`ServeRel=dev\serve.py`，探针 `http://127.0.0.1:5179/dev/live-boot.js`。  
其他项目若入口不是 `live-boot.js`，改 `-ProbePath` 并写进该仓技能/README 自检命令。

无生成器时按下面模板手写（重启环用 `ping -n 3`，**不要**用 `timeout`——Agent/重定向 stdin 会报 `Input redirection is not supported`）：

**`dev/open-serve-detached.bat`**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "<PROJECT> serve <PORT>" cmd /k "%~dp0start-serve-detached.bat"
echo Started detached serve window. You can close this helper.
```

**`dev/start-serve-detached.bat`**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
title <PROJECT> serve <PORT> (detached)
where python >nul 2>&1 || (echo ERROR: python not in PATH & pause & exit /b 1)
:loop
python <SERVE_REL>
echo serve exited %ERRORLEVEL% — restart in 2s
ping -n 3 127.0.0.1 >nul
goto loop
```

占位替换示例（DWT）：`PROJECT=DWT`，`PORT=5179`，`SERVE_REL=dev\serve.py`，探针 `http://127.0.0.1:5179/dev/live-boot.js`。  
其他项目若入口不是 `live-boot.js`，把探针路径写进技能/README 自检命令即可。

可选：再生成 `dev/start-serve-detached.ps1`（参数 `-Port` `-ServeRel` `-ProbePath`），逻辑同 bat 的重启环。

**Agent 联调起服硬闸：** 需要长期 5179 时，优先 `open-serve-detached.bat` / `Start-Process cmd ...`，**禁止**只在当前 Agent shell 前台挂 serve 却告诉用户「关掉 Cursor 也没事」。

服务端**必须**带这些响应头（否则 https 站点拉 `127.0.0.1` 会失败）：

| Header | 值 |
| --- | --- |
| `Cache-Control` | `no-store` |
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Private-Network` | `true` |
| `OPTIONS` | `204` |

自检：

```text
GET http://127.0.0.1:5179/dev/live-boot.js → 200
响应头含 Access-Control-Allow-Private-Network: true
```

端口被占或半死（`RemoteDisconnected`）：杀掉占用进程后重开，不要换一套注入方案，也不要因此催重启 Cursor。

### 2. live-boot.js（页面入口）

职责：

- 幂等：`window.__dwtLiveBoot`（或项目约定的 boot 标志）只跑一次  
- 先挂 CSS（通常 `content/styles/common.css`）  
- **manifest 的 `content_scripts[].css` 必须一并注入（2026-10-19 真机踩坑）**：真实扩展里这些 CSS 由浏览器加载，内置浏览器链路里**没有人**加载它们 → 页面看着一切正常，但 `getComputedStyle(document.documentElement).getPropertyValue('--dwt-*')` 全是空串（面板配色 / 深色高亮全糊）。DWT 现由 `serve.py` 读 manifest 的 CSS 清单，内联成 `<style id="dwt-common-css">` 打进双 bundle；页面里查这个 id 或任一 `--dwt-*` 变量即可判有无。  
- 再串行加载：`dev/chrome-mock.js` → `manifest.content_scripts[].js` 全列表  
- **加载方式（2026-10-17）**：优先 `fetch` 文本 → `eval` / `<style>`（https 页对 `script.src`/`link.href` 指向 `127.0.0.1` 常被 PNA 静默失败；同域 CORS + `Access-Control-Allow-Private-Network` 下 fetch 实测可通）  

**禁止**为内置浏览器单独写第二套导航 / 调试面板 DOM。

### 3. chrome-mock.js

页面上下文没有真实扩展运行时。至少 mock：

- `chrome.storage.local` → 可用 `localStorage` 键（如 `dwt_preview_storage`）  
- `chrome.runtime` 消息 / `getURL` 等调用点（按项目实际用到的 API 补）  

注意：mock 存储与「已解压加载的扩展」的 `chrome.storage.local` **不是同一份**。  
Service Worker、工具栏 popup、options 仍须用 Chrome「加载已解压的扩展程序」验收。

---

## 注入方式（按优先级）

### A. 主进程 did-finish-load（推荐：刷新即注入）

在 Cursor `resources/app/out/main.js` 的 BrowserView `did-finish-load` 钩子调用 `injectDwtLiveBootForState`：每次整页加载/刷新豆包页都注入同一 `http://127.0.0.1:5179/dev/live-boot.js`。

仓库一键补丁：`python dev/_patch_cursor_dwt_inject.py`（备份 `main.js.dwt-bak-*`）。  
Host allowlist 默认匹配 URL 含 `doubao` / `dola`；**新域名**须改补丁 allowlist → 再 apply → 重启。  
Cursor 安装根目录：环境变量 `DWT_CURSOR_ROOT` 优先；未设时脚本按存在性探测 `D:\cursor` → `F:\cursor`。**迁机必设**，勿假设固定盘符。  
Cursor **正在运行**时默认拒绝写盘（防整窗 reload）。紧急止血可用 `DWT_PATCH_WHILE_RUNNING=1`；正常流程仍须退出后打。设 `WHILE_RUNNING` 写完仍须按 Restart gate **完整退出重开** 才会加载新 main（磁盘已是 v3.8 时勿再打补丁，只重启）。

#### 防砖机硬闸（2026-10-18 / v3.7）

| 规则 | 说明 |
| --- | --- |
| 禁止手改 `main.js` 粘贴 boot | 只能跑补丁脚本 |
| 嵌入必须转义 | `BOOT_JS` → `_boot_dq_literal()`；禁止 `'"'+BOOT_JS+'"'` |
| 写盘前 `node --check` | 失败则恢复 `.dwt-bak-*` 并 **abort**；**禁止**此时让用户重启 |
| 跑通才算 | 终端须见 `BOOT_JS_EMBED_OK` + syntax-checked |
| 回归 | `python dev/_test_boot_embed_safety.py` → `ALL_OK` |
| 已砖机急救 | 用最新 `main.js.dwt-bak-*` 覆盖 `main.js`（preload 同理），再开 Cursor；勿先重装 |

历史事故：`aside[class*="gutter"]` 未转义 → 外层 `"..."` 提前结束 →
`SyntaxError: Unexpected identifier 'gutter'` → 主进程起不来。

#### 防整窗重刷硬闸（2026-10-19 / patch v3.8+ — 勿回归）

**症状：** Cursor UI 约每 30–70s 整窗重挂（`Extension host terminating: renderer closed the MessagePort` + `[lifecycle]: Process participant started` 循环）。`dev/.dwt-inject.log` 出现约每 **3s** 的 `sweep-tick`（旧盘 `setInterval(__dwtTick,3e3)`，无 cooldown）。

**根因：** 激进 DWT `main.js` 补丁 — 常驻 3s 全局扫 + BrowserView 再注入 + 无 `__dwtInjAt` cooldown + 嘈杂 `dom-ready` / `did-navigate-in-page`。**禁止**在 Cursor 仍运行时默认强写 `main.js`（除非显式 `DWT_PATCH_WHILE_RUNNING=1` 且接受整窗 reload 风险）。

| 规则 | 说明 |
| --- | --- |
| 默认关周期 tick | **禁止**再发 `setInterval(__dwtTick,3e3)` / `1e4` 常驻；仅当 `DWT_SWEEP_TICK_MS=30000`（或更慢）才开 |
| 硬开关 | `DWT_SWEEP_DISABLE=1`（启动 Cursor 前设进程环境）强制关 tick，即使设了 tick ms |
| 运行中不写盘 | Cursor 在跑 → 补丁脚本 **拒绝** 写；紧急止血可用 `DWT_PATCH_WHILE_RUNNING=1`；正常流程仍须退出后打。优先：完全退出 → `python dev/_patch_cursor_dwt_inject.py`（或 `dev/_apply_conservative_dwt_patch.bat`）→ 见 `DONE v3.8` → 再开 |
| 磁盘标记 | 升级后 `main.js` 须有 `DWT_SWEEP_TICK_MS` / `DWT_SWEEP_DISABLE` / `__dwtInjAt`；**不得**再有 `setInterval(__dwtTick,3e3)` |
| Host / cooldown | 只注入 `doubao\|dola` https；sweep cooldown ≥30s、event ≥15s（v3.9）；无 BrowserView `setInterval` 再注入；无全局 `dom-ready` / in-page 钩子 |

**停刷终验（重打补丁并完整重开后）：**

- `dev/.dwt-inject.log`：无约 3s 一次的 `sweep-tick`（默认仅 one-shot / 事件驱动）
- Cursor `exthost.log`：`MessagePort closed` 间隔 **不**在 ≤90s 内循环，观察 ≥5 分钟
- 最老 `Cursor` 进程 `StartTime` **≥** `main.js` mtime（Restart gate 已过）

#### 防复发取证纪律（v3.8+ 后偶发 remount）

1. 按 `t >= Cursor StartTime`（epoch ms）过滤 inject log；重启前旧 `sweep-tick` 尾部是噪声。  
2. 磁盘已是 tickMs:0 / 无 `setInterval(__dwtTick,3e3)` → 本进程 3s 环已死。  
3. `MessagePort closed` 前 5 分钟 **无** inject 行 → **勿**归咎 DWT eval storm；查 Glass/agent/MCP lifecycle。  
4. **禁止**运行中无门闸写 `main.js`「试修」；偶发 remount ≠ inject 风暴复发。

专项 playbook 同源段落：`doubao-web-toolkit/.cursor/skills/cursor-builtin-browser-extension/SKILL.md`（CRITICAL — never revive whole-window refresh loop）。

### Restart gate（必做，勿跳过）

**唯一硬条件**：Cursor 进程 `StartTime` **早于** 磁盘上已打补丁的 `main.js` 和/或 `preload-browser.js` 的 `LastWriteTime` → 才要求**完整退出并重开** Cursor（Reload Window 不够）。

| 变更 | 要不要完整退出并重开 Cursor |
| --- | --- |
| 刚 apply 了 `main.js` / preload 补丁，且 Cursor **StartTime &lt; 补丁文件 mtime** | **要** |
| 改了补丁脚本里的 host allowlist 并已 re-apply，且 StartTime &lt; 新 mtime | **要** |
| 补丁已在磁盘、且 **StartTime ≥ 补丁 mtime**（进程已加载该补丁） | **不要** — 勿因 UI 缺件再催重启 |
| 只改了 `live-boot.js` / content 模块 / `serve.py` | **不要** — 刷新已有 Glass tab（或 CDP 补同一 live-boot） |
| 补丁未打印 `BOOT_JS_EMBED_OK` / `node --check` 失败 | **不要重启** — 先修补丁或恢复 bak |
| 仅 `gutterVis`/`nativeGutter` 为 false，但 gear+promptBar+nav（panel）已就绪 | **不要**当成「必须重启」——见下方 gutter 误报闸门 |

PowerShell：`Get-Process Cursor` 的 `StartTime` vs Cursor 根目录下 `resources\app\out\main.js`（及 preload）的 `LastWriteTime`。

之后日常：`serve.py` 常开 → 用户点回**已有**聊天 → **刷新**即可。Cursor 升级会覆盖 `main.js`，再跑补丁并按上表决定是否重启。

#### Cursor 升级冲掉补丁 · 一键重打（省 token · 2026-10-23）

**症状：** 以前刷新豆包会自动出 🧰；现在刷新没有，只能 Agent CDP 手动 `eval live-boot`。  
**根因：** Cursor 升级/重装覆盖了 `resources/app/out/main.js`（及 preload），`injectDwtLiveBootForState` / `__dwtInjAt` 消失；**不是**插件业务代码坏了。  
**证据（本机真踩过）：** `main.js` mtime 突然变新且上述标记 `NO`，而 `dev/.dwt-inject.log` 里还能看到旧的 `v36-created ok:true`。

**Agent 硬闸（禁止烧 token 长排查）：**

1. **30 秒探针（只做这些）**  
   - `GET http://127.0.0.1:5179/dev/live-boot.js` → 200？否 → 只起 `python dev/serve.py`，勿打补丁。  
   - 读 `%DWT_CURSOR_ROOT%` 或 `D:\cursor` / `F:\cursor` 下 `main.js`：含 `injectDwtLiveBootForState` 且含 `__dwtInjAt`？  
   - **两者都 YES** → 补丁在；缺 UI 走 lock 已有 tab + CDP 补注 / 查 serve，**禁止**再打补丁。  
   - **标记缺失** → 判定「升级冲补丁」，进入下面短路径，**禁止**先查 vibe/灰屏/CSS/rail。
2. **补丁脚本不在工作区时**：从本地分支取回即可（本仓库常用 `git show local-inject:dev/_patch_cursor_dwt_inject.py`），**不要**为此重写补丁或翻半天历史。公开 `main` 若忽略 `dev/`，脚本本就不入库——以 `local-inject` / 本机 `dev/` 为准。  
3. **重打短路径（用户说「打 / 重打补丁」时）**  
   ```text
   # 仓库根；Cursor 仍在跑时用等待脚本，勿 WHILE_RUNNING 除非用户明确接受风险
   python dev/_wait_quit_then_patch.py
   ```
   - 脚本会写 `dev/.dwt-patch-wait-status.json`：`waiting_for_cursor_quit` → `patching` → `done` / `patch_failed`。  
   - Agent **一句话**：请用户**完全退出 Cursor**（托盘也退），退完脚本自动打；打完看 status=`done` 且输出含 `BOOT_JS_EMBED_OK`。  
   - 用户再**重新打开 Cursor**（Restart gate），并保证 **5179 serve 常开**，刷新已有豆包 tab。  
   - 无等待脚本时等价流程：用户退出 → `python dev/_patch_cursor_dwt_inject.py` → 见成功标记 → 再开 Cursor。  
4. **禁止**：为「不会自动注入」开多轮 Glass 灰屏/CSS 排查；禁止手改 `main.js`；禁止未退出就默认 `DWT_PATCH_WHILE_RUNNING=1`。  
5. **用户自助（零 Agent）**：退出 Cursor 后双击或运行  
   `dev\apply-dwt-patch-after-quit.bat`（内部调 `_wait_quit_then_patch.py` / 直接 `_patch_cursor_dwt_inject.py`）。

**验收：** 新开/刷新已有豆包 chat → `dev/.dwt-inject.log` 出现新的 `ok:true`（或页面有 `#dwt-rail-main`）；`main.js` 再次含 `injectDwtLiveBootForState`。

### gutter 误报闸门（2026-10-19 / v3.10 · v3.12 补强）

**禁止**把下列现象直接汇报成「inject 失败 / 必须重启 Cursor」：

| 观察 | 正确解读 |
| --- | --- |
| `gutterVis.exists=false` / 无 `#dwt-gutter-style` | 当前会话可能走 **panel** 导航（`#dwt-nav`）；原生 gutter 本就不保证每页都有 |
| `navMode=panel` 且 `#dwt-nav` + gear + promptBar 存在 | **inject 已成功**；gutter CSS 路径未启用 ≠ 失败 |
| `navMode=gutter-css` 且 `#dwt-nav` **隐藏**（`display:none` 等） | **预期**——美化宿主 gutter 时故意藏面板导航，禁双栏；≠ inject 失败、≠ 催重启 |
| 宿主有 `aside[class*="gutter"]` 但无 DWT 美化 | 先查 `liveBoot`/`dwt`/gear；缺核心 UI 才算未注入 |
| 主进程报错 `Unexpected identifier 'gutter'` | 这是 **BOOT_JS 未转义砖机**（v3.7），与「页面上看不见 gutter UI」完全无关 |
| StartTime **≥** 补丁 mtime，仅 gutter / `#dwt-nav` 不可见 | **禁止**要求重启；刷新 / CDP 补 live-boot / 查 navMode |

验收以 **核心 UI** 为准：`window.__dwtLiveBoot` + `window.dwt` + gear（`#dwt-panel-toggle`）+ promptBar +（`#dwt-nav` **或** gutter-css 就绪）。gutter 只是 navigator 的优选模式，不是 Restart gate 触发器。

### 批量面板硬约束（DWT batch-input · v3.12）

同 rev reinject / live-boot 重拉时（细则见仓库同名技能 playbook）：

1. **禁止**整面板拆除重建（防闪烁、注解/附件丢）——同 rev 复用 DOM + 内存队列。  
2. 队列键：`dwt_batch_queue_v2`。  
3. 附件 ≤1MB 持久 `dataUrl`；更大刷新后需重选；多附件上限 **10**。  
4. 间隔 / 超时在 **options** 全局（`dwt_min_interval` / `dwt_reply_timeout`）。  
5. **附件条目必须校验送达**：豆包拒绝一切脚本触发插入（合成 `paste` / `input.files` / `input` / `drop` 四条路径实测全无效）。runner 发附件前记 `attachSignature(composer)`，发后 `waitAttachReady(5s)` 比对（img/chip 数或输入区文本变化）；未变 → `FAILED + reason` 且 `PAUSED_BY_ATTACH`，**禁止报 DONE**。模型回复「看到了」**不算**附件送达证据。
6. **回复记录必须能落盘**：面板行只是内存态。逐条跑完要 `GET /dev/bridge/storage` 读回 `dwt_batch_queue_v2`，
   确认每条 `DONE` 且 `reply/result` 与预期答案对应（真机两轮基线：`3加4/12乘3/100减37 → 7/36/63`、
   `2加2/5乘5/90减40 → 4/25/50`）；写路径坏掉时面板照样显示「成功」。

### 临时恢复（缺 UI · 硬闸）

MCP **已有**豆包 chat → 只 lock 该 tab → reload 或 CDP fetch+eval `http://127.0.0.1:5179/dev/live-boot.js`。  
**禁止** Agent 代开豆包（`new` / `open_resource` / navigate）。list 空 → 停手，先活 5179 / 修 inject。

### D. 注入模块 `dev/inject.js`（页面内唯一操作入口 · 2026-10-19）

> **⚠ 当前代码库状态（2026-10-28 调试确认）**：`dev/inject.js` **不存在**于仓库。
> 实际注入入口是 `dev/live-boot.js`（包含 `NEED_MODULES` 完整性闸门 + `uiReady` 自检 + beacon 回传）。
> `window.dwtInject` API（`status()` / `run({force:true})`）**不可用**。
> 强制重装走 `live-boot.js`：`fetch+eval` 同一份 `live-boot.js`（serve `no-store` 保证最新）。
> SPA 路由自愈由各模块内部 observer 负责（非 inject.js 统一 hook）。
> 下文描述的 inject.js 架构为**设计意图**，尚未实现；如后续补建此文件，再更新本节。

三件套（serve.py + live-boot + chrome-mock）的**唯一操作入口**：幂等、自校验完整性、SPA 路由自愈（hook
`pushState`/`replaceState`/`popstate`）、beacon 回传 `/dev/bridge/verify`。**不要再自己拼注入脚本**。

```javascript
// 冷启动 / 刷新后：仅需 eval 本文件（模块内部会自动跑一次）
const t = await (await fetch('http://127.0.0.1:5179/dev/inject.js', { cache: 'no-store' })).text();
(0, eval)(t);
await window.dwtInject.status();               // 复查：missingCore / missingOptional / uiReady / complete
await window.dwtInject.run({ force: true });   // 改完模块要真强制重装走这里
```

**force 语义坑（勿再踩）**：`inject.js?force=1` 只是给 URL 加查询串破 HTTP 缓存，
模块内部 `run({})` 在 `complete` 时会短路 → **看起来重装了，其实一行新代码都没进去**。
真强制重装只有 `await window.dwtInject.run({ force: true })` 这一条路。

**ZCode / IAB 自动化路径**（本机实测）：`process.env.ZCODE_PLUGIN_ROOT` + `scripts/browser-client.mjs`
→ `agent.browsers.get("iab")` → `tabs.list()` → `tabs.get(id)` → `tab.playwright.evaluate`。
`evaluate` 有 **3s 上限**：fetch+eval 这类长操作要「先触发、再轮询」两段式
（`window.__flag='pending'` → `run().then(...)` → 后续调用轮询 `__flag`），别指望一次 await 到底。

**注入后自检**：`node dev/verify.js` → 30/30 PASS, exit 0（清单一致性 + 逐文件源码内联比对 + 批量不变量
+ **多任务不变量** + **快捷回复不变量** + **回复大纲不变量** + **面板拖拽不变量** + **说明表格不变量** + **外观跟随不变量** + **内置导航栏不变量** + **背景氛围不变量** + **双 bundle 内联 manifest CSS** + 端点 + **四条落盘回归**：OPTIONS 预检 CORS 头各出现一次、存储桥 PUT 往返、
存储里多任务索引自洽（索引摘要 == 队列实际状态）、存储里快捷回复配置自洽（`dwt_prompts` 三种写法之一且条目完整）。
负向回归：拖拽不变量 `dev/_test_panel_drag_mutations.py`（9 变异，全 CAUGHT）、说明表格不变量 `dev/_test_help_table_mutations.py`（15 变异，全 CAUGHT）。
> **⚠ 当前代码库状态（2026-10-28 调试确认）**：`dev/verify.js` **不存在**于仓库。
> 实际可跑的自检是 `dev/_test_boot_embed_safety.py`（BOOT_JS 转义安全）和 `dev/_check_patch.py`（补丁标记检查）。
> `dev/_test_panel_drag_mutations.py` 和 `dev/_test_help_table_mutations.py` 也不存在。
> 验收仍以 `GET /dev/bridge/verify` beacon + 页面 DOM 检查为准。

**说明文本表格化（2026-10-20）**：面板里的解释性文案改走 `openTip` 的 `blocks` 结构化模式
（`[{title, cols?, mono?, rows: [[k, v], …]}]` → 分节标题条 + 表格），批量面板「?」使用说明（6 分节 / 37 行）
与调试面板「使用说明」（4 行）已改。两条量过才知道的：① **宽 tip 会被推出右边界** —— 默认 320px 装不下两列，
加 `opts.width`（470）后原定位里写死的 `innerWidth - 340` 夹取就不够了，必须按**实测宽度**算
（`el.offsetWidth || 320`）；② **深色下强调色要就地提亮** —— 硬编码 `#2d72de` 压在深色表底上只有 **3.38:1**，
改 `var(--dwt-accent,#2d72de)` + `html.dwt-ui-dark … { color:#7fb0ff }`（与导航栏 `#4d8bf5/#7fb0ff` 同套，
不动 `common.css` 共享变量）后 **7.06:1**。表格一律 `createElement` + `textContent`（禁 `innerHTML`）；
**数据/可编辑 tip（重命名/前置词/单条内容/回复全文）保持文本模式**；表格化最容易顺手丢信息，
故验收逐条钉住 6 个分节与 9 条键位信息。
**同轮自查出的两处深色缺陷（调试面板那张表）**：① `table/td/summary` **不在** `common.css` 深色 `div` 批处理的
覆盖范围内 —— 表正文写死 `#444` 压在深色表底上只有 **1.6:1**，表格要**自己带色**（`var(--dwt-fg,#1f2328)` →
11.43:1）；② **元素上的行内 `color` 压过样式表规则** —— summary 带行内 `color:var(--dwt-accent)` 时，
深色提亮规则不写 `!important` 就接不上（实测仍是 `rgb(45,114,222)` = 3.05:1），带 `!important` 后 6.37:1。
验证渲染时**别手改类名**：theme 模块的幂等 observer 会立刻把 `html.dwt-ui-dark` 纠正回宿主信号 ——
要测深色就改真信号 `document.documentElement.setAttribute('data-theme','dark')`，量完再还原。

**浮动面板拖拽（2026-10-19）**：九个面板共用一个核心 `content/core/panel-drag.js`
（`dwt.drag.attach/restore/detach`，位置存 `dwt_panel_pos`，按面板 key 分条目）。三条踩出来的硬约束：
① **绑定要同时记在元素上**（`el.__dwtDragBound`）+ `owns(el, b)` 判归属 —— 重注入会新建模块实例
（实例内 `bound` 是空 Map），只按实例内 Map 摘不掉上一实例的 handler，两个 handler 同拖一个元素、各自落盘，
表现为「面板过一会儿自己跳回旧位置」；② **落盘必须读-改-写、只合并本次改过的键**（`dirty` 集合）——
`set({[KEY]: map})` 整份写回会把旧快照写回去（真机：存储 `725,656` 而 DOM 在 `4,4`，别的面板键直接消失）；
③ **复用/hot-reload 早退分支要重挂把手**（batch 同 rev 复用、snip `_ready` 早退、conv `buildBar()` 复用三处同型）。
细节：`pointermove/pointerup` 挂 `window` capture 且**成对**摘、`MOVE_MIN=3` 位移阈值（点一下不算拖）、
`EXCLUDE` 名单护住 `button/a/input/textarea/select/label/summary/[contenteditable]`、
`EDGE=4` 视口夹取、右/下锚定的面板先清 `right`/`bottom` 再 `fixed` 定位。

**批量面板是多任务的**（2026-10-19）：索引键 `dwt_batch_tasks_v1`（`activeId` + 各任务摘要）+
每任务队列键 `dwt_batch_task_q_<id>`，legacy `dwt_batch_queue_v2` 仍写并镜像**活动任务**。
同一时期只允许一个任务进行中：跑动中任务下拉与新建/重命名/复制/删除全禁用。
查记录时别只看面板：`curl -s http://127.0.0.1:5179/dev/bridge/storage` 里核对索引摘要与
每个 `dwt_batch_task_q_<id>` 队列的 status/reply 是否一致。

**静默丢写两类坑（2026-10-19 真机事故，均已修复 + 加回归）**：
1. **预检头重复**：serve 的 `do_OPTIONS` 把 `end_headers()` 已发的 CORS 头又发一遍 → 预检响应变成
   `Access-Control-Allow-Origin: *, *` → Chrome 判预检失败 → 页面侧 `chrome.storage.local.set`
   （PUT + JSON 需预检）全部 `Failed to fetch`，而 mock 的 `.catch(function(){})` 把它吞掉。
   症状极隐蔽：**面板一切正常，队列记录从没落盘**。预检头只允许由 `end_headers()` 发一次。
2. **请求体 framing**：客户端不带 `Content-Length` 时走 `Transfer-Encoding: chunked`，
   服务端若只按 `Content-Length` 读体 → 读到空体却仍回 200（又一次静默丢写）。
   serve 的 `_read_json` 现同时支持两种帧；验收客户端显式带 `Content-Length`。
3. **非 UTF-8 字节**：Git Bash 的 curl 发中文时字节集可能不是 UTF-8 → serve 侧 JSON 解析失败 →
   `_read_json` 回退 `{}` → 仍回 `200 {changes:{}}`。症状：`ok:true` 但存储纹丝不动。
   写存储桥要么用 Node http 显式 `Content-Length`，要么直接驱动页面里的 `chrome.storage.local`。

**快捷回复（prompt-bar）不变量（2026-10-19）**：容器 id `dwt-prompt-bar` 与命名空间 `dwt.promptBarModule`
必须保留（`live-boot.js` / `inject.js` 的 uiReady gate 按 id 判定）；插入一律走 execCommand 链
（`insertParagraph` + `insertText`），**禁止 `pm.innerHTML` 直写**（ProseMirror state 失配 → `removeChild` 崩页）。
编辑草稿必须是 `{groups:[…]}` 形状——写成裸数组时渲染读 `d.groups` 会抛错并被 click 监听吞掉，
表现为「点 ✎ 后编辑区空白」，verify 有正/负断言防回潮。`common.css` 的 `!important` 深色批处理
不得包含 `#dwt-prompt-bar`（容器是无底色布局盒，被刷上 `--dwt-bg` 会凭空多出方块）。

**回复大纲（reply-outline）不变量（2026-10-19）**：`#dwt-outline` 只按**真实 `h1~h6`** 抽取
（豆包把 Markdown 标题渲染成真标题元素）——**无标题必须 `items []` + `.dwt-ol-hidden`**，不许按段落/加粗猜伪大纲；
抽取范围是「当前视口内可见高度最大的那条 AI 回复」，用户消息行也命中同一个 class，必须按用户气泡排除
（`closest || querySelector`；真实回复**含** `message-action-bar`，所以不能用动作条过滤）；
跳转必须算内部滚动容器（`div.v_list_scroller-*`）的 `scrollTop + 相对偏移 - JUMP_OFFSET`，用 window 滚会点了没反应；
重注入时句柄在 `window.__dwtOutlineState`，要卸掉观察器 + **两处**滚动监听（window 捕获 + 容器）；
模块内**不得出现任何网络请求**（合规：纯本地抽取）。

**内置导航栏（native gutter 承载）不变量（2026-10-19）**：豆包原生 `aside[class*="gutter"]` 轨道就是导航宿主 ——
`#dwt-gutter-labels` 直接挂进 aside 当卡片本体（`position:absolute; top:0; max-height:100%`），
定位模型保持豆包原样（`right:12px; top:84px; bottom:16px; width:200px`，空档 `pointer-events:none` 点透），
`html.dwt-native-gutter` 下 `#dwt-nav` 隐藏。**三条红线**：① 禁给 `[class*="w-34"]`（刻度列）写 `padding !important` ——
会压掉豆包自己的内联 `padding-top/bottom: 388px` 居中，刻度挤成栏顶小簇（rev19–36 就是这么坏的）；
② 藏刻度内容必须 `aside > div:not(#dwt-gutter-labels)` —— 一刀切 `> div` 会把同为直接子节点的自家卡片一起
`display:none`（rev38 真机白屏，矩形 0×0）；③ 观察器必须过滤自身记录（`labels.contains(target)` /
`target === labels.parentElement`）—— 卡片进了被观察子树后 DOM 自激会让渲染进程 119% CPU，页面卡到
IAB `browser tabs list` 30s 超时（只能 kill 掉 spin 的渲染进程恢复）。**改样式必升 `NAV_REV`**：
同 rev 重注入走「already mounted」短路，新 CSS 不会生效。深色下 `--dwt-accent` 无深色档 →
卡片内就地覆盖 `#4d8bf5`/`#7fb0ff`（与 `.dwt-nav-dark` 同套），不动 `common.css` 共享变量。

**外观跟随（theme）不变量（2026-10-19 · DWT v0.3.2）**：插件**只跟随宿主自己的外观设置**——信号顺序
`html[data-theme]` → `localStorage['dbx-web-theme']` → 页面亮度，`prefers-color-scheme` **仅最后兜底**
（本机常态是「系统深色 + 豆包浅色」，信系统必判反）。theme 模块切 `html.dwt-ui-dark` 后**必须派发**
`dwt:themechange`；用平行配色类的模块（navigator 的 `.dwt-nav-dark`）订阅该事件重算——CSS 变量自己会翻，
class 不会。收藏高亮 `mark.dwt-hl` 的深色规则必须覆盖 **mark 子孙**且特异性 ≥(0,2,1)，
否则被宿主容器 class 深色规则 (0,2,0) 压住 → 黄底浅字；深色 `!important` 批处理里
`#dwt-snip-panel .dwt-snip-meta` 要单独保留 `--dwt-muted`（被正文色批处理刷亮 → 层级全糊）。
`--dwt-*` 变量来自 manifest 的 `content_scripts[].css`，dev 链靠 serve 内联（见「静态服务」节）。

**新模块接线清单（本轮真踩到漏项）**：加一个功能模块要同时改 **6 处**——
`manifest.json`、`dev/serve.py` 的 bundle 清单、`dev/live-boot-full.js` 的 `optionalFiles`、
`dev/inject.js` 的 `NEED_MODULES`（**⚠ inject.js 不存在，此处应改 live-boot.js 的 NEED_MODULES**）、`dev/live-boot.js` 的 `NEED_MODULES`（**完整性闸门**）、`dev/fixture.html`（**⚠ fixture.html 不存在于仓库**）；
再加 `content-loader.js` 分发 + popup/options 开关。
**漏掉 `live-boot.js` 那处最阴**：optional bundle 少挂该模块时闸门仍判「完整」，兜底全量链永不触发，
页面看起来正常但功能永远不出现。verify 现有断言强制「闸门必须点名每个可选模块」。

**受控标签列表为空时**：`tabs.list()` 空 ≠ 用户页面没了。用 `browser.user.openTabs()` 列出用户真实标签，
再 `browser.user.claimTab(info)` 接管**已有**标签（严禁新建豆包标签）；接管后它出现在 `tabs.list()` 里，
后续用 `tabs.get(id)`。

### B. preload 备份钩子

相对路径：`resources/app/out/vs/platform/browserView/electron-main/preload-browser.js`（标记 `dwt-glass-inject`）。仅作备份；主路径以 A 为准。

### C. CDP / Runtime.evaluate 兜底（勿另做 UI）

当 `__dwtGlassBoot` / `__dwtLiveBoot` 为 false、页面没有扩展节点时：

```javascript
(async function () {
  if (window.__dwtLiveBoot || window.__dwtGlassBoot) return { already: true };
  window.__dwtGlassBoot = true;
  var t = await (await fetch("http://127.0.0.1:5179/dev/live-boot.js", { cache: "no-store" })).text();
  (0, eval)(t);
  return { injected: true, dwt: !!window.dwt };
})();
```

用 Cursor `browser_cdp` → `Runtime.evaluate`（`awaitPromise: true`）即可（仅 A/B 都失败时）。**不要**再插 `script.src` 指向 loopback（PNA 下常无请求）。  
失败时只排查：是否已重启 Cursor 加载 main 补丁、5179 是否 200、CORS/PNA、manifest 列表——**不要**画临时导航列表冒充插件。

**2026-10-17 午**：`browser_tabs` 能 `new` 出短 id，但立刻从 list 消失、`browser_navigate(viewId)` 报 view not found；fork/子代理下 `open_resource` 可能 `unknown agent`。此时按硬闸停手：若用户**已经**手开了豆包标签，Agent 只 `browser_tabs` list → lock 已有 tab → CDP reload/inject。**禁止** Agent `new` / `open_resource` / `browser_navigate` 豆包 URL（含「全程自动」场景）。MCP list 为空但用户确认页面仍在时：停手；只修代码/服务，等该标签 MCP 可见——**不要**擅自再开一份。**禁止**外开 Chrome。

---

## Trae 内置浏览器篇（2026-10-18 实测通过 · v3.8）

Trae（TRAE IDE）内置浏览器同样不能装扩展，但**不需要任何主进程补丁**：其 MCP 浏览器工具自带 `browser_evaluate`（页面上下文执行、同一执行世界跨调用持久），等价于 Cursor 的 `browser_cdp Runtime.evaluate`——Cursor 里的「兜底 C 路径」在 Trae 就是**主路径**。三件套（`serve.py` / `live-boot.js` / `chrome-mock.js`）与 Cursor 完全同一套，零改动。

### 与 Cursor Glass 差异速览

| 项 | Cursor Glass | Trae 内置浏览器 |
| --- | --- | --- |
| 注入入口 | main.js 补丁 sweep / preload / browser_cdp 兜底 | `browser_evaluate` fetch+eval 即主路径 |
| 主进程补丁 | 必须（Restart gate 等） | **不需要**；无砖机风险 |
| 执行世界 | Runtime.evaluate 主世界 | 同一执行世界跨 evaluate 调用持久（`window.dwt`、`__dwtLiveBoot` 可复查） |
| SPA 路由切换 | 注入存活 | 注入存活（侧栏点会话无需重注入）；**整页刷新/新开 tab 后补一次** |
| 登录 | 手动 | 独立调用 `browser_waiting_for_user_interaction` 交还用户（**禁**放进 Exec，**禁**与其他工具并行） |
| Tab rule | 严禁代开豆包页（ghost tab 风险） | MCP 直见 tabs：list → 有豆包 tab 则 `activate` 复用，无则 `browser_navigate` 打开 |
| 验收 | beacon + browser_cdp 查 DOM | beacon（`.serve-access.log` / `.verify-last.json`）+ `browser_evaluate` 查 DOM + `browser_take_screenshot`+`image()` 目检 |

### Trae 注入步骤（end-to-end，实测一发入魂）

0. 前置与 Cursor 相同：仓库根目录 `python dev/serve.py`（自检 200 + `Access-Control-Allow-Private-Network: true`）。
1. 浏览器工具走 **Exec（code_mode）**：`await tools.browser_tabs({action:'list'})` → 有豆包 tab 就 `activate`，无则 `browser_navigate` 打开目标页。
2. 未登录 → **独立一轮**调用 `browser_waiting_for_user_interaction`，等用户登录完再继续。
3. 注入（fetch 必须发生在**页面上下文**——Exec V8 沙箱自身无 fetch）：

   ```javascript
   // Exec 内：
   await tools.browser_evaluate({
     script: "const t = await (await fetch('http://127.0.0.1:5179/dev/live-boot.js',{cache:'no-store'})).text(); (0, eval)(t); 'ok'"
   });
   // evaluate 返回值可能 undefined —— 以第二次 evaluate 复查为准，勿据此判失败
   ```

4. 验收（一次 evaluate 取齐）：

   ```javascript
   await tools.browser_evaluate({
     script: "JSON.stringify({ dwt: !!window.dwt, gear: !!document.getElementById('dwt-panel-toggle'), promptBar: !!document.getElementById('dwt-prompt-bar'), nav: !!document.getElementById('dwt-nav'), snip: !!document.getElementById('dwt-snip-toggle'), boot: !!window.__dwtLiveBoot })"
   });
   ```

   期望全 true；serve 侧 `.verify-last.json` 应见 `liveBoot:true` + `uiReady:true` + 豆包 origin 的 beacon POST；再 `browser_take_screenshot({})` 后必须 `image(shot)` 输出目检（gear / prompt-bar / 导航 / 划词钉）。

### Trae 踩坑速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Exec 里 `fetch is not defined` | Exec 是 V8 沙箱，无 fetch/网络 | fetch+eval 整体放进 `browser_evaluate` 的 `script` 字符串 |
| `browser_evaluate` 返回 undefined | script 内嵌套引号转义翻车；引擎自动包裹（**禁手写 IIFE**） | script 内用单引号、外层双引号；别拼接复杂 `\\n`；结果拆下一次 evaluate 复查 |
| 工具指南说 evaluate「Read-Only Only / 禁 fetch」 | 交互建议，非技术限制 | 注入是 C 路径同款例外，允许 eval；日常交互仍走原生工具 |
| 豆包 chat URL 重定向回 `/chat` | 当前登录账号下无此会话 | 与注入链路无关；换账号或侧栏任选会话即可（扩展匹配 `doubao.com/*` 全站） |
| 截图后看不到图 | `browser_take_screenshot` 返回值未输出 | 必须 `image(shot)`；只接受带 `__images` 的原始返回值 |
| 整页刷新后 UI 消失 | 注入不随页面持久化（无 main 补丁） | 重新跑第 3 步同一段 eval 即可；serve `no-store` 保证拿最新 |
| 想刷新即自动注入（不跑 evaluate） | Trae 无 main.js 补丁机制 | 目前接受「刷新后补一发 eval」；若后续 Trae 开放 preload/CDP 能力再升级 A 路径 |

---

## ZCode IAB 内置浏览器篇（2026-10-28 实测通过 · v3.25）

ZCode 自带 IAB（In-app Browser）同样不能装扩展，也无 main.js 补丁机制。注入方式与 Trae 相同——`browser_evaluate` fetch+eval `live-boot.js`。但 ZCode IAB 有以下特性：

### 与 Cursor Glass / Trae 差异速览

| 项 | Cursor Glass | Trae 内置浏览器 | ZCode IAB |
| --- | --- | --- | --- |
| 注入入口 | main.js 补丁 sweep / preload / browser_cdp 兜底 | `browser_evaluate` fetch+eval | `tab.playwright.evaluate` fetch+eval |
| 主进程补丁 | 必须（Restart gate 等） | 不需要 | **不需要**；无砖机风险 |
| 执行世界 | Runtime.evaluate 主世界 | 同一执行世界跨 evaluate 持久 | 同一执行世界跨 evaluate 持久 |
| 刷新后 | main 补丁自动重注入 | UI 消失，需手动 eval | UI 消失，需手动 eval 或书签小程序 |
| 自动注入 | ✅ main.js `did-finish-load` | ❌ 无补丁机制 | ❌ 无补丁机制；可用书签小程序半自动 |
| 桌面布局修复 | 不需要（Cursor 桌面环境） | 不需要 | **需要**：豆包 `sm:fixed` CSS 未加载，需注入 CSS 修复 |

### ZCode IAB 注入步骤（end-to-end）

0. 前置：`dev/serve.py` 常开（5179 端口 200 + PNA 头）。
1. `agent.browsers.get("iab")` → `browser.tabs.list()` → 有豆包 tab 则 `tabs.get(id)`。
2. 注入（fetch 必须发生在**页面上下文**——evaluate 内 fetch+eval）：

```javascript
// playwright.evaluate 内：
if (!window.__dwtLiveBoot) {
  window.__dwtLiveBoot = true;
  const t = await (await fetch("http://127.0.0.1:5179/dev/live-boot.js", { cache: "no-store" })).text();
  (0, eval)(t);
}
```

3. 启用划词工具（**源码已修复 `_explicitEnabled` 标志**）：

```javascript
// 源码修复（2026-10-29）：selection-tools/module.js 的 setEnabled(true) 设置
// S._explicitEnabled = true，loadStore() 检查该标志后不再把 S.enabled 覆盖回 false。
// 因此只需直接调用 setEnabled(true)，无需复杂轮询：
window.dwt?.selectionToolsModule?.setEnabled?.(true);
// 可选：setInterval 每 500ms 重试 30 秒，确保 loadStore() 完成后仍生效
var n = 0;
var timer = setInterval(function () {
  try { window.dwt?.selectionToolsModule?.setEnabled?.(true); } catch (_) {}
  if (++n >= 60) clearInterval(timer);
}, 500);
```

> **源码修复细节（2026-10-29）**：
> - `setEnabled(v)`：`v=true` 时设置 `S._explicitEnabled = true`
> - `loadStore()`：`if (r[FEAT_KEY] === false && !S._explicitEnabled) S.enabled = false;` —— 检查标志后再覆盖
> - `loadStore().then()`：`if (!S.enabled && !S._explicitEnabled) setEnabled(false);` —— 同样检查标志
> 这样书签小程序 / Agent 调用 `setEnabled(true)` 后，storage 里的 `dwt_selection_tools:false` 不会再把入口顶掉。

4. 桌面布局修复（豆包 `sm:fixed` Tailwind CSS 未加载，sidebar 嵌在主内容区重叠）：

```javascript
// 注入 CSS：NAV fixed + 主内容区偏移
var s = document.createElement("style");
s.id = "dwt-desktop-layout-fix";
s.textContent = `
  nav.panel-fvxXfj { position: fixed !important; left: 0 !important; top: 0 !important;
    width: 280px !important; height: 100vh !important; overflow: hidden !important; z-index: 50; }
  #chat-route-main { margin-left: 280px !important; width: calc(100vw - 280px) !important; }
  #chat-route-layout > aside { display: none !important; }
`;
document.head.appendChild(s);
```

5. 验收（一次 evaluate 取齐）：

```javascript
JSON.stringify({
  bootFlag: !!window.__dwtLiveBoot,
  gear: !!document.getElementById("dwt-panel-toggle"),
  railMain: !!document.getElementById("dwt-rail-main"),
  promptBar: !!document.getElementById("dwt-prompt-bar"),
  snipToggle: !!document.getElementById("dwt-snip-toggle"),
  selEnabled: window.dwt?._selToolsState?.enabled,
  navFixed: getComputedStyle(document.querySelector("nav.panel-fvxXfj"))?.position,
  mainOffset: getComputedStyle(document.getElementById("chat-route-main"))?.marginLeft,
})
```

期望：`bootFlag:true, gear:true, railMain:true, promptBar:true, snipToggle:true, selEnabled:true, navFixed:"fixed", mainOffset:"280px"`。

### ZCode IAB 书签小程序（半自动注入）

刷新页面后插件丢失，无 main.js 补丁。可用书签小程序（bookmarklet）半自动恢复：

- 文件：`dev/dwt-auto-inject-bookmarklet.txt`
- 用法：在 IAB 书签栏新建书签，名称"DWT注入"，URL 粘贴文件全部内容
- 刷新豆包页面后，点击书签即可自动完成注入 + 启用划词 + 桌面布局修复
- 书签小程序内置 3 秒轮询重试 + 划词轮询（`setInterval` 60 次 × 500ms，配合源码 `_explicitEnabled` 标志）

### ZCode IAB 定时自动化（真·自动注入 · 2026-10-29 实测）

ZCode IAB 无主进程补丁，但可用 **ZCode 定时自动化（CronCreate）** 实现真·自动注入——每 2 分钟自动检查一次豆包页面，插件丢失立即补注入：

- **自动化名称**：`豆包插件自动注入（每2分钟）`（cron `*/2 * * * *`）
- **流程**：① curl 检查 5179 serve，非 200 则跑 `dev/open-serve-detached.bat`（detached 脱钩）→ ② `agent.browsers.get("iab")` → ③ `tabs.list()` / `user.openTabs()` 找豆包标签（claimTab 接管）→ ④ evaluate 检查 `__dwtLiveBoot`/`dwt`/gear，**在位则立即结束** → ⑤ 缺件则补注入（重置幂等守卫 `__dwtLiveBoot=false` 再置 true → fetch+eval live-boot → setEnabled 轮询 → 桌面布局 CSS）→ ⑥ evaluate 验收
- **关键坑（2026-10-29 真踩）**：**幂等守卫必须在 fetch 成功后才置 true**——先置 true 再 fetch，serve 挂了时 fetch 失败、eval 不执行，但守卫已置 true，后续注入全被拦截（表现为 bootFlag:true 但 `window.dwt` 空）。补注入前必须先 `__dwtLiveBoot=false` 重置。
- **前提**：serve 常开（`dev/open-serve-detached.bat`，与 Agent 终端脱钩）；自动化运行在同 workspace，可访问 IAB 与 Bash。

**局限**：补注入最多延迟一个周期（≤2 分钟）；每轮自动化消耗少量 token。若可接受， Cursor Glass 的 main.js 补丁仍是零延迟方案。

### ZCode IAB 踩坑速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 刷新后插件消失 | IAB 无 main.js 补丁，注入不持久 | 定时自动化补注入（≤2 分钟）；或书签小程序点击一次 |
| 刷新后 `snipToggle` 不出现 | `loadStore()` 异步读 storage `dwt_selection_tools:false` 覆盖 `setEnabled(true)` | 源码已加 `S._explicitEnabled` 标志（v3.26）；注入后调用 `setEnabled(true)` + `setInterval` 轮询 |
| 注入显示 bootFlag:true 但 `window.dwt` 空、UI 全缺 | 幂等守卫在 fetch **前**置 true，serve 挂了时 fetch 失败 eval 不执行，守卫却已置 true，后续注入全被拦截 | 补注入前先 `__dwtLiveBoot=false` 重置；serve 起来后再注入（定时自动化已内置此修复） |
| Agent/终端里起的 serve 随会话死掉，刷新后 fetch 失败 | serve 与 Agent 进程未脱钩（v3.23） | 用 `dev/open-serve-detached.bat` 启动（独立窗口）；自动化检查到 5179 挂了会自动重启 |
| 页面看起来是手机端 | 豆包 `sm:fixed` Tailwind CSS 未加载，sidebar `position:relative` 不生效 | 注入 CSS：`nav.panel-fvxXfj { position:fixed }` + `#chat-route-main { margin-left:280px }` |
| `chrome.storage.local.set` 在书签小程序里静默失败 | 刷新后 `chrome-mock.js` 未加载，`chrome.storage` 不存在 | 不要在注入前写 storage；改在注入后长轮询 `setEnabled(true)` |
| IAB `evaluate` 超时（32s） | `chrome.storage.local.get(null)` 拉取全部 2.5MB 数据超时 | 只查单个 key（字符串），不要 `null` |
| `tab.playwright.evaluate` IIFE 语法报错 | 书签小程序的 `(function(){...})()` 在 evaluate 中解析问题 | 传函数形式：`tab.playwright.evaluate(() => { ... })` |

---

## 验收清单（注入后立刻查）

用 `Runtime.evaluate` 一次取齐：

| 检查项 | 期望 |
| --- | --- |
| `window.__dwtLiveBoot` | `true` |
| `window.dwt`（或项目全局命名空间） | 存在，且模块键齐全 |
| 调试入口（如「⚙ 调试」）/ 提示词条 / 导航等约定节点 | 存在 |
| `#dwt-outline`（回复大纲） | **只在当前回复含真实 `h1~h6` 时可见**；纯文本回复必须带 `.dwt-ol-hidden`（不显示、不补伪大纲）；面板不与 `#dwt-nav` 重叠 |
| `#dwt-common-css`（manifest CSS 内联） | 存在；`getComputedStyle(document.documentElement).getPropertyValue('--dwt-bg')` 非空 |
| 外观跟随 | 改宿主外观（豆包：设置 → 外观）后 **≤1.5s** 全部注入 UI 翻转；**两个方向都要验**（深→浅、浅→深）——只验一边会漏「平行配色不重算」类 bug |
| 控制台 | 无 content script `SyntaxError`（MV3 content 禁止 ES Module `import/export`） |

布局预览可另开：`http://127.0.0.1:5179/dev/preview.html`（只调弹窗皮肤时用；不能代替真实宿主页注入）。

---

## 踩坑速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 脚本标签插入了但请求打不到本机 | Private Network Access / CORS | 服务加 `Access-Control-Allow-Private-Network` + OPTIONS 204 |
| 服务端口在听但 urllib 断连 | 旧进程半死 | 杀进程，重启 `serve.py` |
| UI 突然「全没了」、怀疑补丁丢了 | **多半是 serve 5179 挂了** | 先 `GET /dev/live-boot.js` 200；再查 Restart gate；勿先重打 main |
| 新标签没插件、旧标签曾成功 | preload 只在新视图加载 / 被升级覆盖 | 重写 preload，或 CDP 注入同一 `live-boot.js` |
| `window.dwt` 始终 false | 未注入、服务挂了、或脚本用了 ES Module | 查 boot 标志、5179、manifest 传统脚本 |
| `navMode=gutter-css` 时找不到 `#dwt-nav` | 故意 CSS 隐藏面板导航 | 属预期；查 gear/promptBar/gutter 样式即可 |
| 导航/列表串会话 | 宿主是 SPA，只首扫一次 | content script 内监听 `/chat/<id>` 等路由变化并重扫 |
| 导航全量收集时宿主聊天区短暂自动滚动 | 虚拟列表必须程序滚动才能挂载更早气泡；与「用户无需手滚面板」不是一回事 | 收集逻辑须带超时/会话 abort；失败时回退当前视口气泡，禁止死循环滚动 |

| 面板内容溢出裁切 | flex 子项 `min-height:auto` | 容器 `overflow:hidden`，滚动区 `min-height:0` |
| Puppeteer/`--load-extension` 仍无扩展 | 独立 Chrome 与 Cursor Glass 隔离 | **内置浏览器目标禁止走这条路**；真扩展用本机 Chrome「加载已解压」单独验收 |
| `cursor-ide-browser` MCP 不存在 / list 无豆包 tab | Glass 自动化未接通或标签不可见 | 停手；只修 inject/serve；**禁止** `open_resource`/new 代开豆包；勿外开 Chrome |
| Settings 已 Connected 但 `browser_tabs` 空（MCP ghost） | Glass 可见 ≠ MCP 列表 | **禁止**催 Accept / 代开豆包；靠 `getAllWebContents` 补丁 + `/dev/bridge/verify` beacon |
| 补丁后零 inject 日志 | ESM `main.js` 里裸 `require()` 静默失败 | 用 ESM-safe fs/路径；eager sweep + every-tick 日志（v3.5+） |
| sweep match≥1 但无 live-boot / Script failed | BOOT_JS 外层双引号含 `\n` 变成真换行 | `String.fromCharCode(10)`（v3.6） |
| 重启后主进程 `Unexpected identifier 'gutter'` / Cursor 打不开 | BOOT_JS 含 `class*="gutter"` 等未转义 `"`，打断 `const __dwtBoot="..."` | v3.7：`_boot_dq_literal` + `node --check`；恢复 `.dwt-bak-*`；`_test_boot_embed_safety.py` |
| 只有部分模块挂上、gear/nav 缺 | 5179 被 inject 风暴打满 6-conn/host | `serve._critical_bundle_bytes()` 内联 critical；defer bus poll |
| 新加的功能模块在页面上**永远不出现**，但页面看着一切正常 | 只同步了 `inject.js` 的 `NEED_MODULES`，漏了 `dev/live-boot.js` 的**完整性闸门** | 新模块接线 **6 处**（manifest / serve bundle / live-boot-full / inject.js / **live-boot.js** / fixture）；verify 有断言强制闸门点名每个可选模块 |
| 大纲点了没反应 / 滚到别的回复大纲不换 | 用了 `window.scrollTo` 或只监听 `window` 滚动 | 豆包聊天区是内部容器 `div.v_list_scroller-*`：跳转算 `sc.scrollTop + 相对偏移`，滚动监听要挂在容器上（并同时保留 window 捕获） |
| 大纲把**提问**也当回复抽了 | AI 内容 class 用户消息行也命中 | 按用户气泡排除：`n.closest(userSel) \|\| n.querySelector(userSel)`；**别**用 `message-action-bar` 过滤（真实回复也含它） |
| 误用外开 Chrome「验证注入」 | 把 Glass 目标做成了扩展导入端验收 | 杀掉临时 Chrome 用户目录进程，回到本技能链路 |
| 迁机后补丁打到错误目录 / 默认盘符不存在 | 未设 `DWT_CURSOR_ROOT` 且探测失败 | 设 `DWT_CURSOR_ROOT` 指向真实安装根再跑补丁；本机常见 `D:\cursor` |
| 未重启却报 gutter 失败 / 催重启 | 把 `gutterVis` / `#dwt-nav` 隐藏或砖机关键字当成 inject 失败 | 先跑 Restart gate（StartTime vs mtime）；核心 UI 齐或 gutter-css 模式则勿催重启 |
| v3.8+ 后偶发整窗 remount | Glass/MCP lifecycle；旧 log 尾噪声 | 按 StartTime 滤 inject log；无近期 inject 勿怪 DWT；禁运行中无门闸写 main |
| 同 rev reinject 批量面板闪 / 注解丢 | 整面板拆除重建 | 同 rev 复用 DOM；队列 `dwt_batch_queue_v2`；见 batch 硬约束 |
| 磁盘无补丁标记但 verify 曾为 true | 旧 beacon / 仅 CDP 临时注入 / 升级冲掉 main | 查 `injectDwtLiveBootForState`；缺失则 re-apply 补丁 → Restart gate |
| 回填收藏后整页崩溃（白屏/`removeChild NotFoundError`），只能重开页面 | content script 用 `pm.innerHTML=...` 直写宿主 ProseMirror/contenteditable；PM 内部 state 与 DOM 失配，下一次 reconcile 崩掉整个 React 应用 | **硬闸：宿主编辑器 DOM 严禁 innerHTML 直写**；走 `execCommand('insertParagraph'/'insertText')` 输入事件链，兜底仅派发 `InputEvent`（2026-10-18 修复 `insertIntoInput`） |
| 深色模式高亮变黄底浅字不可读 | DARK_CSS 排除规则 `[class*="pl-16"|"text-s-color"]:not([data-dwt-hl])` 特异性 (0,2,0)，压过 mark 深字规则 (0,1,1)；跨节点高亮 `extractContents` 会把带宿主 class 的 span 移进 mark 内部 | **约束：`:not([data-dwt-hl])` 只查元素自身，管不住子孙；mark 深字规则必须 ≥(0,2,1)**（如 `mark[class*="dwt-hl"][data-dwt-hl] *`），新增浅色字规则时同步检查（2026-10-18 修复 DARK_CSS） |
| 深色下注入 UI 配色全糊 / `--dwt-*` 全空串 | dev 链**从不加载** manifest 的 `content_scripts[].css`（真实扩展由浏览器加载） | serve 读 manifest CSS 清单内联进双 bundle（`<style id="dwt-common-css">`）；beacon 上报 `css` 字段（只提示，**不**参与 uiReady 判定） |
| 插件深浅色与宿主反了 | 信了 `prefers-color-scheme`（系统设置 ≠ 宿主设置） | 只读宿主信号：`html[data-theme]` → `localStorage['dbx-web-theme']` → 页面亮度；系统偏好**只作最后兜底** |
| 切外观后导航条还是旧配色 | 该模块配色是 JS 上的平行 class，不随 CSS 变量翻转 | theme 模块在 `dwt-ui-dark` 变化后派发 `dwt:themechange`；平行配色模块订阅后重算（别只在 mount 时算一次） |
| IAB playwright `locator.click({timeout})` 报 `unrecognized_keys` | 该封装 `click()` 不收任何参数 | 直接 `click()`；**别写重试循环吞异常**（会把报错当「没点到」得出假结论） |
| IAB 里没法拖选 / 按 Esc | 封装无 `keyboard` / `mouse`（无拖选、无按键） | 划词验证：`Range.setStart/setEnd` + `sel.addRange` + 派发 `mouseup`（带 clientX/Y）走插件自己的处理器；关弹窗点真实关闭控件 |
| IAB `dblclick()` 选中的是 `"\n"` | 多行块的几何中心落在行间空隙 | 双击**叶子元素**，或直接用 Range 选区 |
| 宿主设置弹窗里所有行量到 0×0 | 弹窗漂进了 iframe 子页（如 `/member/subscription`） | 关掉重开；关闭控件是 `div[role="dialog"] div.w-32.h-32:visible`（**不是 button**） |
| 页面内 `querySelectorAll('…:visible')` 抛 not a valid selector | `:visible` 是 playwright 专有伪类 | 页面内自写可见性判定（`getBoundingClientRect()` 尺寸 > 0） |
| 模块代码明明改了、真机就是没效果（served bundle 里注释是新的、调用行还是旧的） | serve 缓存只比 `mtime`；本机出现过「内容已改、mtime 没变」 | 缓存键改 `(st_mtime, st_size)`；怀疑时 `curl` 那个 bundle 直接 grep 新调用行 |
| 拖过的面板过一会儿自己跳回旧位置 / 别的面板的位置键从存储里消失 | 重注入新建实例摘不掉旧实例的监听（两个 handler 同拖一个元素）+ 整份 posMap 写回旧快照 | 绑定同时记元素（`el.__dwtDragBound`）+ `owns(el, b)`；落盘读-改-写只合并 `dirty` 里的键 |
| 同 rev 复用 / hot-reload 早退分支重注入后把手没了、拖不动 | 早退分支只跑了创建路径，没重挂 | 抽 `bindDrag(...)`，创建与复用分支都调用（batch/conv/snip 三处同型） |
| 浮动面板拖拽误吞按钮点击（点 × 变成拖） | 把手覆盖了按钮区域 | 核心 EXCLUDE 名单排除 `button,a,input,textarea,select,label,summary,[contenteditable],.dwt-no-drag`，并有 `MOVE_MIN` 位移阈值（<3px 不算拖） |
| 加了自定义宽度的浮层被推出视口右边界 | 定位里的右边界夹取按**默认宽度**写死（`innerWidth - 340`），宽浮层（470）算不够 | 夹取改成按**实测宽度**：`const w = el.offsetWidth \|\| 320` 再 `innerWidth - w - 8` |
| 深色下浮层里的强调色标题读不清 | 品牌强调色硬编码（`#2d72de`），压在深色底上只有 3.38:1 | 组件内就地覆盖：`color:var(--dwt-accent,#2d72de)` + `html.dwt-ui-dark …{ color:#7fb0ff }`（与导航栏同套，不动 `common.css` 共享变量）→ 7.06:1 |
| 表格化说明后有条目/字段悄悄丢了 | 长串文改表格时最容易漏行，且不会有报错 | 结构化渲染走数据数组 + 验收逐条钉住（分节标题、关键键位字段逐个 `indexOf`），改完跑负向变异脚本 |
| 深色下说明表格正文糊成一片 | `table/td/summary` 不在 `common.css` 深色 `div` 批处理里，写死 `#444` 只有 1.6:1 | 表格**自己带色**：正文 `var(--dwt-fg,#1f2328)`、表底走 `--dwt-*` 变量，别写死 |
| 深色提亮规则加了却没生效（还是旧强调色） | 该元素带**行内 `color`**，行内样式压过样式表规则 | 提亮规则加 `!important`（同 `common.css` 深色批的写法）；或去掉行内色只留样式表规则 |
| 手改 `html.dwt-ui-dark` 测深色没效果 | theme 模块的幂等 observer 会按宿主信号立刻纠正类名 | 改**真信号**：`document.documentElement.setAttribute('data-theme','dark')`，量完还原 |
| `tab.playwright.reload` 不存在 / evaluate 里 `location.reload()` 报「Inspected target navigated or closed」 | 该封装只暴露部分方法；在 evaluate 内导航会打断这次调用 | 用 `await tab.reload()`（Tab 级），再 `tab.playwright.waitForTimeout(ms)` 等就绪；`tabs.list()` 返回的只是轻量 tab 信息，要 `.playwright` 得用 `browser.tabs.selected()` |
| `#dwt-snip-toggle` 不存在 / beacon `snipToggle:false`，但模块已加载（`dwt.selectionToolsModule` 存在） | storage 里 `dwt_selection_tools: false`（用户曾手动关闭过），`loadStore()` 设 `S.enabled=false` → `ensureToggle()` 不挂 rail 入口 | **预期行为**，不是 bug。恢复：`window.dwt.selectionToolsModule.setEnabled(true)` 或清 storage 键。验收时勿因 `snipToggle:false` 判 inject 失败——核心 UI（gear/promptBar/nav）齐即可 |
| 面板拖拽后位置未保存到 storage（DOM 位置变了但 `dwt_panel_pos` 还是旧值） | IAB 下 `persist()` 的 `setTimeout` 回调不触发 + `Promise.resolve(chrome.storage.local.get(KEY))` 包装后 thenable 丢失回调 | **2026-10-28 已修复**：`onUp` 中直接同步写 `localStorage` + `chrome.storage.local.set(posMap)` 兜底，不依赖 `setTimeout`；`load()` 优先读 `localStorage` 同步兜底再读 `chrome.storage` |

---

## Agent 操作顺序（建议）

0. **闸门**：目标是 Glass → 禁止外开 Chrome；**Tab rule**：`browser_tabs` list → **仅** lock 已有同 URL chat；**禁止** `new` / `open_resource` / 导航开目标页（即使用户说全程自动）；list 空则停手只修代码 / 用 inject log + verify；同 URL 重复则关掉多余只留一个  
1. 确认模块已挂进 **manifest + live-boot critical/full**（与已解压扩展同一链路；禁止另画 Glass UI）  
2. 启动 `5179`（200 + PNA）；确认 `main.js` 已含 `injectDwtLiveBootForState` + 版本标记；域名在 allowlist  
3. **Restart gate**：仅当 StartTime &lt; patch mtime 才要求完整退出重开；**禁止**因 gutter 不可见催重启  
4. **仅当** MCP 已见目标 tab：lock → `Page.reload` / 等 finish-load / CDP 补 `live-boot.js`。**不得** Agent 代开目标页；MCP 空时**禁止**催 Accept  
5. 取证：inject log `ok:true` + 核心 UI（gear/promptBar/nav 或 gutter-css）+ `GET /dev/bridge/verify`（**jsdom probe 不得计为验收**；**gutterVis 单独不得否决**）  
6. 只改 content / live-boot / serve → **不**重启 Cursor，刷新已有页即可（serve `no-store`）  

决策树：

```text
用户要「注入某域名，刷新 Glass 就能看到」？
  ├─ 5179 非 200 / 无 PNA → 修/启 serve.py（UI 空先查这个）
  ├─ 磁盘无 injectDwtLiveBootForState / dwt-glass-inject → apply 补丁 → Restart gate
  ├─ StartTime < main.js|preload mtime → 请用户完整重启 Cursor，再刷新（唯一「必须重启」）
  ├─ StartTime ≥ mtime 且仅缺 gutter / gutter-css 藏 #dwt-nav → 不重启
  ├─ 仅 live-boot/content/serve 变更 → 不重启，刷新已有 Glass tab
  ├─ MCP 有豆包 tab、UI 缺 → lock 后 reload / CDP 拉 live-boot（禁代开）
  ├─ MCP 空 → 不 nag Accept；查 inject log + verify beacon
  └─ 仍失败 → 同 tab CDP 补同一 live-boot；禁止外开 Chrome / 禁开重复 URL
```

---

## 边界（本技能不做）

- 不在内置浏览器里模拟完整 MV3 Service Worker 生命周期  
- 不把 mock 存储当成线上用户数据  
- 不绕过合规：只做 DOM 层辅助调试，不引导逆向 API / 去水印等灰区能力  
- 不扫描或改写 Cursor 安装目录，除非用户明确要求恢复 preload 钩子  
- 不把「已解压扩展」本机验收与 Glass live-boot 验收混为一谈
