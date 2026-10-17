---
name: glass-dwt-inject-accept
description: >-
  Operator playbook: inject an extension/project into a Glass host domain so
  refresh shows the plugin. Preflight (serve 5179, Cursor patch markers,
  restart gate via process StartTime vs patch mtime, host allowlist, manifest
  load chain), then verify inject log + uiReady. Use when user says inject X
  into domain Y and refresh Glass, or when debugging DWT Glass inject/accept.
---

# Glass DWT Inject / Accept

**Announce at start:** 正在使用 glass-dwt-inject-accept 技能。

Companion hard gate: `D:\other\docs\skills\cursor-builtin-browser-extension\SKILL.md` +
`.cursor/rules/glass-tab-reuse.mdc`.

---

## Invocation pattern

When user says (any close phrasing):

> 将某浏览器插件注入哪个域名，刷新内置浏览器就能看到

→ run this skill **end-to-end**: preflight → restart gate → wire/serve → verify → report pass/fail.

Same for: inject [extension/project] into [domain], refresh Glass to see it.

---

## Preflight checks (report pass/fail)

Do all six. Report each as ✅/❌ before claiming progress.

### 1. Serve 5179 + live-boot 200

```text
GET http://127.0.0.1:5179/dev/live-boot.js → 200
Header: Access-Control-Allow-Private-Network: true
```

If down: `python dev/serve.py` (repo root). Port half-dead → kill occupant, restart serve.

### 2. Cursor inject patch on disk

Script: `dev/_patch_cursor_dwt_inject.py`  
Targets:

- `D:\cursor\resources\app\out\main.js`
- `...\vs\platform\browserView\electron-main\preload-browser.js`

Markers (current): `ver:'v36'` / `v36-sweep` / `injectDwtLiveBootForState` / `String.fromCharCode(10)`.

❌ missing → run patch script, then **restart gate** (check 3).

### 3. Restart needed? (mandatory)

Compare **Cursor process StartTime** vs **main.js + preload mtime** (and whether allowlist in patch script changed + was re-applied).

| Condition | Action |
| --- | --- |
| Cursor StartTime **&lt;** patch file mtime (main.js and/or preload) | **MUST** fully quit + reopen Cursor. Reload Window is **not** enough. Tell user **one** clear action. |
| Host allowlist changed in `_patch_cursor_dwt_inject.py` and re-applied | Restart required |
| Only `dev/live-boot.js` / content modules / `serve.py` changed | **NO** Cursor restart — refresh existing Glass tab (or wait inject sweep) |
| Patch present, StartTime **≥** mtime, allowlist unchanged | No restart |

**Never claim done** if patch files changed without completing this check.

PowerShell sketch:

```powershell
$p = Get-Process Cursor -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1
$main = Get-Item 'D:\cursor\resources\app\out\main.js'
# Restart if $p.StartTime -lt $main.LastWriteTime (same for preload)
```

### 4. Domain in host allowlist

Patch matches hosts containing `doubao` / `dola` (see `HOST_OK` in patch script).

- Domain already covered → OK  
- **New domain** → update allowlist in `_patch_cursor_dwt_inject.py` → re-apply → **restart Cursor**

### 5. Modules on same load chain as unpacked extension

Wire new modules into:

1. `manifest.json` `content_scripts` order (unpacked Chrome path)  
2. `live-boot` critical / full bundles (`serve.py` critical-inline + `live-boot-full`)

**No** separate Glass-only UI. Glass must load the **same** scripts the unpacked extension uses.

### 6. Hard gate (tabs)

- Reuse existing **same-URL** Glass tab; never Agent-`new` / `open_resource` / navigate duplicate target chat URLs  
- MCP `browser_tabs` empty → stop page ops; use `dev/.dwt-inject.log` + `GET /dev/bridge/verify`  
- No external Chrome

---

## Workflow steps

```text
Task Progress:
- [ ] Wire module into manifest + live-boot critical/full (same chain)
- [ ] Preflight 1–6 reported
- [ ] Restart gate decided; if needed → tell user ONE action, wait
- [ ] User refreshes existing Glass tab (or inject sweep hits)
- [ ] Inject log: ok:true + ver marker (e.g. v36)
- [ ] Verify: uiReady + domain UI (gear / promptBar / navigator or equivalent)
- [ ] Report pass/fail + what changed vs restart yes/no
```

1. **Wire** → content module + manifest + live-boot load list  
2. **Ensure serve** → 5179 + live-boot 200  
3. **Restart gate** → if patch/allowlist touched and StartTime stale → user must fully quit+reopen Cursor (**one** sentence)  
4. **After load** → check inject log `ok:true`; beacon `uiReady` + UI flags  
5. **MCP has tab** → lock that tab only → reload / CDP `live-boot` if needed  
6. **MCP empty** → no nag “Accept”; rely on patch + log + verify beacon  

Verify beacon:

```text
GET http://127.0.0.1:5179/dev/bridge/verify
```

Trust only Origin/UA-filtered real host posts. **jsdom probe / `reason: jsdom-critical-probe` ≠ accept.** Reset: `POST` `{"reset":true}`.

---

## Restart-rule summary (memorize)

- **Restart Cursor** when: `main.js` / preload patch re-applied, or host allowlist changed+applied, and process StartTime is older than those files.  
- **No restart** when: only serve / `live-boot.js` / feature modules changed → refresh Glass (or wait sweep).

---

## Breakthroughs (compact)

| Topic | Rule |
| --- | --- |
| MCP ghost | Settings “Connected” ≠ `browser_tabs` list; don’t open target URL; don’t nag Accept |
| Inject without MCP | Patch main/preload sweeps `getAllWebContents()`; logs: `dev/.dwt-inject.log` + `%TEMP%\dwt-inject.log` |
| ESM main | No bare `require()` in patch — silent zero logs |
| BOOT_JS | Outer double-quoted `\n` → real newline / Script failed; use `String.fromCharCode(10)` |
| 6-conn | Critical modules inlined into one `/dev/live-boot.js` fetch; defer bus poll |

---

## Anti-patterns

| Don’t | Why |
| --- | --- |
| Nag “Accept” / reconnect when MCP empty | Ghost ≠ disconnected |
| Open duplicate target chat URLs | Tab hard gate |
| Claim done without restart check after patch files change | Stale process = old inject |
| Separate Glass-only DOM instead of manifest chain | Fake accept |
| External Chrome / `--load-extension` as Glass proof | Wrong pipe |
| Count jsdom probe as uiReady | False positive |

---

## Key paths

| Path | Role |
| --- | --- |
| `dev/serve.py` | 5179; critical-inline; verify bridge |
| `dev/live-boot.js` | Page entry; uiReady beacon |
| `dev/_patch_cursor_dwt_inject.py` | Cursor main/preload patch + host allowlist |
| `dev/.dwt-inject.log` | Inject evidence (do not commit) |
| `manifest.json` | Canonical content_scripts order |

---

## Related

- Hard gate / generic Glass embed: `D:\other\docs\skills\cursor-builtin-browser-extension\SKILL.md`
- Repo rule: `.cursor/rules/glass-tab-reuse.mdc`
