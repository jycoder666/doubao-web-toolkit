# PROJECT_STATUS

Updated: 2026-10-17 17:59 (nav gutter + inject: doc sync)

## 已完成（近期导航 / 注入联调）

### Native gutter CSS（优先）
- `navigator` **`NAV_REV=10`**（以工作树 `content/features/navigator/module.js` 为准）。
- 检测到 `aside[class*="gutter"]` → 注入 `#dwt-gutter-style` + 徽标 `#dwt-gutter-count`；`html.dwt-gutter-ok` 时 **CSS 隐藏** `#dwt-nav`（属预期，不是丢了）。
- rev9+：**`enableGutterMode` 成功时不 `remove` 面板**（仅 CSS 隐藏）；失败则 `gutterGaveUp`、卸样式、强制 `#dwt-nav` 可见。
- **`ensureNavAlive`**：保证 gutter-ok 或面板至少一种在视口内；同 rev 热注入缺面板且非 gutter-ok 时 remount。
- rev10：gutter 挪右强制 `min-width:34px`，避免 aside 塌成 ~3px。
- Glass 验收（近期）：豆包 chat **双采 gutter ~34×664** 稳定可见（mode=`gutter-css`）；硬闸：不代开豆包、同 URL 复用已有 Glass 标签。

### Cursor inject 补丁
- 重装 / 升级 Cursor 后需重跑 `dev/_patch_cursor_dwt_inject.py`。
- minify 别名（`u`/`d` 等）**自动探测多组 HOOK_VARIANTS**。
- 打补丁后必须**完全退出再开 Cursor**（仅 reload Glass 不够）。

### Boot / serve
- `dev/serve.py` critical-inline 已含 navigator + **selection-tools**（`#dwt-snip-toggle` 不依赖 full bundle）。
- `dev/live-boot.js` 与 gate 配套（critical-inline 版本号随 serve 递增）。
- selection-tools：先 `mount()` 再异步 `loadStore()`，避免 Glass→5179 storage 挂死挡住钉按钮。

### 更早：UI beacon Accept **PASS**（2026-10-17 15:35）
UpdateGoal-ready? **Yes** — gear + prompt bar + navigator mounted; `uiReady=true`。

| Element | Beacon |
|---------|--------|
| ⚙ gear (`dwt-panel-toggle`) | **YES** |
| Prompt bar | **YES** |
| Navigator | **YES** |
| `uiReady` | **true** |

Root cause（当时）：5179 6-conn storm 打断 critical fetches → serve 改 critical-inline 单响应。硬闸保持。

---

## 待完成 / 待检测

- [ ] **重装/升级 Cursor 后自动 inject 是否仍生效** — 查 `%APPDATA%` 侧 `.dwt-inject.log` 是否有新 sweep；必要时重跑 `_patch_cursor_dwt_inject.py` 并完全重启 Cursor。
- [ ] **`#dwt-nav` 回退路径稳定性** — 人为/无 gutter、`gutterGaveUp`、非 `dwt-gutter-ok` 时面板是否持续可见、无闪卸双无。
- [ ] **选区工具 `#dwt-snip` / `#dwt-snip-toggle`** — critical 已 inline；是否仍需划词/交互才出现，Glass 冷刷新后钉按钮是否默认可点。
- [ ] **导航采集完整性** — 被动 DOM/Fiber + 自然滚动；长会话未滚到的历史提问是否需用户滚动补齐（设计如此，待产品确认是否够用）。
- [ ] **搜索** — gutter CSS 模式不在 scope（仍依赖面板搜索时需回退路径）。
- [ ] 勿把大量 `dev/_accept_*` / `dev/_poll_*` / `dev/_probe_*` 一次性探针当成正式功能；正式入口仍是 serve + live-boot + patch 脚本。

---

## 操作备忘（非功能缺口）

1. 模块-only 改动：刷新已有 Glass 豆包 tab 即可加载（勿 new 豆包页）。
2. inject 补丁改动：完全退出 Cursor → 再开 → list 已有 chat → lock → reload / CDP eval `http://127.0.0.1:5179/dev/live-boot.js`。
3. 可行性笔记（非验收源）：`dev/_gutter_nav_feasibility.md`（未纳入正式文档义务）。
