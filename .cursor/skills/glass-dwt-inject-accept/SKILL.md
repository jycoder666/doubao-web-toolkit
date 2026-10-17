---
name: glass-dwt-inject-accept
description: >-
  Glass Doubao DWT inject/accept playbook: MCP ghost tabs, Cursor main.js patch
  without MCP, ESM require pitfalls, BOOT_JS newline syntax, Chromium 6-conn
  critical-inline, Origin/UA verify beacon. Use when injecting live-boot on
  Doubao Glass, debugging empty browser_tabs, patching Cursor main/preload,
  serving 5179, or accepting gear/promptBar/navigator uiReady.
---

# Glass DWT Inject / Accept

Hard-won lessons for `doubao-web-toolkit` on Cursor Glass. Companion hard gate:
`D:\other\docs\skills\cursor-builtin-browser-extension\SKILL.md` and
`.cursor/rules/glass-tab-reuse.mdc`.

**Announce at start:** 正在使用 glass-dwt-inject-accept 技能。

---

## When to use

- Glass 豆包页缺 ⚙ / 提示词条 / 导航，或 `uiReady` 假
- Settings 显示 Connected to Browser Tab，但 MCP `browser_tabs` 为空
- 改 `dev/_patch_cursor_dwt_inject.py` / `live-boot.js` / `serve.py` 后验收
- Inject 日志静默、`Script failed`、`Invalid or unexpected token`
- 5179 被打满、critical 模块只加载一半

---

## Breakthroughs（必须内化）

### 1. MCP ghost tabs

Settings「Connected to Browser Tab」**不等于** MCP `browser_tabs` list。
Glass 里肉眼可见的豆包页可以在 MCP 侧完全空白。

- Agent **不得**因此打开 `doubao.com`（glass-tab-reuse 硬闸）
- MCP 空时：只改 inject / serve / 补丁 / 文档；等用户已有标签变为 MCP 可见
- **不要**催用户「去 Accept / 点连接」来填满 MCP list——那解决不了 ghost

### 2. Inject without MCP

主路径：`python dev/_patch_cursor_dwt_inject.py` 补丁 Cursor `main.js` / `preload-browser.js`。

- 补丁扫 `getAllWebContents()`，即使 MCP 盲也能命中豆包 WC
- 钩子：`did-finish-load` / `focus` / `did-navigate` / `did-navigate-in-page` + eager VP sweep
- 日志：`dev/.dwt-inject.log` 与 `%TEMP%\dwt-inject.log`
- **补丁只在完整重启 Cursor 后生效**（Reload Window 不够）

### 3. v3.4 → v3.5：ESM `main.js` 静默 `require()` 失败

新版 Cursor `main.js` 为 ESM：补丁里 `require("fs")` / `require("os")` 会静默失败 → **零 inject 日志**。

- 用 ESM-safe 路径（`process.env.TEMP` 等）与合法 `import`/`fs` 注入点
- Eager VP sweep + **every-tick logging**（sweep 有无 match 都要落盘）
- 禁止在 ESM main 补丁里依赖裸 `require`

### 4. v3.6 BOOT_JS：外层双引号里的 `\n`

`BOOT_JS` 嵌在 outer double-quoted string 时，源码里的 `\n` 会变成真实换行 →
`Invalid or unexpected token` / Script failed；sweep `match=1` 但 stub 不跑。

- **Fix:** 换行用 `String.fromCharCode(10)`，外层引号内禁止字面 `\n` 转义
- 标记：`ver:'v36'` + `String.fromCharCode(10)+'//# sourceURL='`

### 5. Critical boot / 6-conn limit

Chromium **每 host 6 连接**到 `127.0.0.1:5179`。Inject 风暴 + 串行 critical fetch
会占满连接 → gear/nav 拉挂，只剩 promptBar+domObserver 等幸存者。

- **Fix:** `serve.py` `_critical_bundle_bytes()` 把 critical 内联进 `/dev/live-boot.js`（一次 fetch）
- `chrome-mock` **推迟** bus poll，把预算留给 critical UI
- incomplete-retry：半截 boot / 缺 ⚙·提示词·导航时再补
- Beacon 证明：`uiReady` + gear / promptBar / navigator

### 6. Verify beacon（MCP ghost 时优先）

MCP 空时不要靠截图验收。优先：

```text
GET http://127.0.0.1:5179/dev/bridge/verify
```

- 只信 **Origin/UA 过滤后**的真实 Glass `verify_post`（`doubao.com/chat`）
- UI flags：`gear` / `promptBar` / `navigator` / `uiReady`
- **jsdom probe / `reason: jsdom-critical-probe` 不得计为验收**
- 需要清空：`POST /dev/bridge/verify` body `{"reset":true}`

### 7. Ops checklist

1. `python dev/serve.py` → `5179` 常开（CORS + `Access-Control-Allow-Private-Network`）
2. `python dev/_patch_cursor_dwt_inject.py` → **完整重启 Cursor**
3. 用户点回**已有**豆包 chat（或 F5）；Agent 不代开
4. 查 `.dwt-inject.log` 有 `ok:true` / `v36`
5. 查 verify beacon `uiReady=true`

---

## Workflow（Agent）

```text
Task Progress:
- [ ] serve 5179 200 + PNA
- [ ] main 含 v36 BOOT + fromCharCode(10)；否则补丁 + 请用户重启
- [ ] browser_tabs list（可空）
- [ ] MCP 有豆包 → lock → reload/CDP；MCP 空 → 不 nag、不 new，靠补丁+beacon
- [ ] GET /dev/bridge/verify → uiReady + gear/promptBar/navigator
- [ ] 失败只修 inject/serve/补丁；禁止开豆包 / 外开 Chrome
```

### MCP 有 tab

1. `browser_tabs` list → 同 URL 重复则关多余只留一个  
2. `browser_lock` → `Page.reload` 或 CDP fetch+eval `http://127.0.0.1:5179/dev/live-boot.js`  
3. 交叉验证 CDP DOM + verify beacon  

### MCP 空（ghost）

1. **停手页面操作**；硬闸：禁止 new / open_resource / navigate 豆包  
2. 确认补丁版本 + 用户已重启 + serve 存活  
3. 读 inject log + Origin/UA-filtered verify  
4. 需要交互时等用户侧标签变为 MCP 可见  

---

## Anti-patterns

| 禁止 | 原因 |
| --- | --- |
| MCP 空时催用户 Accept / 重连 Browser Tab | Ghost ≠ 未连接；浪费回合 |
| Agent 打开 / 导航 doubao.com | 硬闸；Settings 已有页仍可能 MCP 盲 |
| 外开 Chrome / `--load-extension` 冒充 Glass 验收 | 链路分立 |
| ESM `main.js` 补丁用裸 `require()` | 静默失败，零日志 |
| BOOT_JS 外层双引号写 `\n` | Script failed，有 match 无执行 |
| critical 多段串行 fetch 打 5179 | 6-conn 饿死 gear/nav |
| 把 jsdom probe 当 uiReady 验收 | 假阳性 |
| 画临时 `#dwt-nav` 冒充插件 | 验收作废 |

---

## Key paths

| Path | Role |
| --- | --- |
| `dev/serve.py` | 5179；critical-inline；verify bridge |
| `dev/live-boot.js` | 页面入口；uiReady beacon |
| `dev/chrome-mock.js` | chrome.* mock；defer bus poll |
| `dev/_patch_cursor_dwt_inject.py` | Cursor main/preload v36 补丁 |
| `dev/.dwt-inject.log` | 主进程 inject 证据（勿提交） |
| `PROJECT_STATUS.md` | 最近验收快照 |

---

## Related

- Hard gate / 通用 Glass 扩展嵌套：`cursor-builtin-browser-extension`（`D:\other\docs\skills\...`）
- 仓库硬闸规则：`.cursor/rules/glass-tab-reuse.mdc`
