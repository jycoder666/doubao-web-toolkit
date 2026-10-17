# -*- coding: utf-8 -*-
"""Patch Cursor BrowserView to auto-inject live-boot on Doubao Glass tabs.

Install path (this machine):
  MAIN    = D:\\cursor\\resources\\app\\out\\main.js
  PRELOAD = D:\\cursor\\resources\\app\\out\\vs\\platform\\browserView\\electron-main\\preload-browser.js

When inject runs (v3.6):
  ROOT CAUSE fixed vs v3.5 script-execution failure:
    - BOOT_JS was embedded in a JS double-quoted string containing c+'\\n//#...'.
      Outer-string parse turned \\n into a real newline → Invalid or unexpected
      token inside executeJavaScript. Sweep found the Doubao WC (match=1) but
      the stub never ran → no verify_post / no live-boot fetch from Glass Origin.
  v3.6:
    - BOOT_JS uses String.fromCharCode(10) (no \\n escapes in outer quotes)
    - In-place upgrade of embedded __dwtBoot / preload boot payloads
    - Richer .dwt-inject.log on failure (message, stack slice, bootLen, ver)
    - Preload: catch executeJavaScript failures + ping reason; keep interval path
  v3.5 retained:
    - Eager global sweep, ESM-safe fs, sweep-tick, web-contents-created hooks

  Log paths:
      D:\\other\\doubao-web-toolkit\\dev\\.dwt-inject.log
      %TEMP%\\dwt-inject.log
"""
from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path

MAIN = Path(r"D:\cursor\resources\app\out\main.js")
PRELOAD = Path(
    r"D:\cursor\resources\app\out\vs\platform\browserView\electron-main\preload-browser.js"
)

# Project + temp log paths (escaped for embedding in main.js string literals).
INJECT_LOG_PROJECT = r"D:\\other\\doubao-web-toolkit\\dev\\.dwt-inject.log"
INJECT_LOG_TEMP_EXPR = 'require("os").tmpdir()+"\\\\dwt-inject.log"'
# ESM-safe temp path (no require): use process.env.TEMP / TMPDIR.
INJECT_LOG_TEMP_ESM = (
    '(process.env.TEMP||process.env.TMP||process.env.TMPDIR||".")+"\\\\dwt-inject.log"'
)

# Cursor rebuilds minify aliases (u→d, Pj→$fe, VP→S2, …). Try each (old, new) pair.
HOOK_VARIANTS = [
    (
        'a.on("did-finish-load",()=>{this.injectColorSchemePreferenceForState(d),'
        "d.onDidFinishLoad.fire({viewId:r})})",
        'a.on("did-finish-load",()=>{this.injectColorSchemePreferenceForState(d),'
        "this.injectDwtLiveBootForState(d),d.onDidFinishLoad.fire({viewId:r})})",
    ),
    (
        'a.on("did-finish-load",()=>{this.injectColorSchemePreferenceForState(u),'
        "u.onDidFinishLoad.fire({viewId:r})})",
        'a.on("did-finish-load",()=>{this.injectColorSchemePreferenceForState(u),'
        "this.injectDwtLiveBootForState(u),u.onDidFinishLoad.fire({viewId:r})})",
    ),
]

FOCUS_HOOK_VARIANTS = [
    (
        'a.on("focus",()=>{this.logService.trace(`[BrowserViewMainService] webContents focused (window ${e})`),'
        "d.onDidFocus.fire({viewId:r})})",
        'a.on("focus",()=>{this.logService.trace(`[BrowserViewMainService] webContents focused (window ${e})`),'
        "this.injectDwtLiveBootForState(d),d.onDidFocus.fire({viewId:r})})",
    ),
    (
        'a.on("focus",()=>{this.logService.trace(`[BrowserViewMainService] webContents focused (window ${e})`),'
        "u.onDidFocus.fire({viewId:r})})",
        'a.on("focus",()=>{this.logService.trace(`[BrowserViewMainService] webContents focused (window ${e})`),'
        "this.injectDwtLiveBootForState(u),u.onDidFocus.fire({viewId:r})})",
    ),
]

NAV_HOOK_VARIANTS = [
    (
        'a.on("did-navigate",(f,v)=>{d.consoleLogs=[],d.networkRequests=[],'
        "d.onDidNavigate.fire({url:v,isMainFrame:!0,viewId:r})})",
        'a.on("did-navigate",(f,v)=>{d.consoleLogs=[],d.networkRequests=[],'
        "this.injectDwtLiveBootForState(d),"
        "d.onDidNavigate.fire({url:v,isMainFrame:!0,viewId:r})})",
    ),
    (
        'a.on("did-navigate",(h,_)=>{u.consoleLogs=[],u.networkRequests=[],'
        "u.onDidNavigate.fire({url:_,isMainFrame:!0,viewId:r})})",
        'a.on("did-navigate",(h,_)=>{u.consoleLogs=[],u.networkRequests=[],'
        "this.injectDwtLiveBootForState(u),"
        "u.onDidNavigate.fire({url:_,isMainFrame:!0,viewId:r})})",
    ),
]

NAV_INPAGE_VARIANTS = [
    (
        'a.on("did-navigate-in-page",(f,v,T)=>{'
        "d.onDidNavigateInPage.fire({url:v,isMainFrame:T,viewId:r})})",
        'a.on("did-navigate-in-page",(f,v,T)=>{'
        "this.injectDwtLiveBootForState(d),"
        "d.onDidNavigateInPage.fire({url:v,isMainFrame:T,viewId:r})})",
    ),
    (
        'a.on("did-navigate-in-page",(h,_,v)=>{'
        "u.onDidNavigateInPage.fire({url:_,isMainFrame:v,viewId:r})})",
        'a.on("did-navigate-in-page",(h,_,v)=>{'
        "this.injectDwtLiveBootForState(u),"
        "u.onDidNavigateInPage.fire({url:_,isMainFrame:v,viewId:r})})",
    ),
]

# Legacy single-name constants kept for grep/docs; prefer *_VARIANTS above.
HOOK_OLD, HOOK_NEW = HOOK_VARIANTS[-1]
FOCUS_HOOK_OLD, FOCUS_HOOK_NEW = FOCUS_HOOK_VARIANTS[-1]
NAV_HOOK_OLD, NAV_HOOK_NEW = NAV_HOOK_VARIANTS[-1]
NAV_INPAGE_OLD, NAV_INPAGE_NEW = NAV_INPAGE_VARIANTS[-1]

_BV_ELECTRON_IMPORT_RE = re.compile(
    r'import\{([^}]*\bWebContentsView\b[^}]*)\}from"electron";?'
)

PRELOAD_LISTENERS_OLD = (
    "    tryInject();\n"
    '    window.addEventListener("DOMContentLoaded", tryInject);\n'
    '    window.addEventListener("pageshow", tryInject);\n'
)
PRELOAD_LISTENERS_NEW = (
    "    tryInject();\n"
    '    window.addEventListener("DOMContentLoaded", tryInject);\n'
    '    window.addEventListener("pageshow", tryInject);\n'
    '    window.addEventListener("focus", tryInject);\n'
    '    document.addEventListener("visibilitychange", () => {\n'
    '      if (document.visibilityState === "visible") tryInject();\n'
    "    });\n"
)

# IMPORTANT: BOOT_JS is embedded inside JS double-quoted strings in main.js /
# preload. Never put \\n / \\t / \\r / \\x.. escapes here — the outer quote
# parse consumes them and injects real control chars into the page script
# (v3.5: Invalid or unexpected token). Use String.fromCharCode for newlines.
BOOT_JS = (
    "(function(){"
    "function inc(){try{"
    "if(!document.getElementById('dwt-panel-toggle'))return!0;"
    "if(!document.getElementById('dwt-prompt-bar'))return!0;"
    "var navEl=document.getElementById('dwt-nav');"
    "var navMod=window.dwt&&window.dwt.navigatorModule;"
    "var gutterOk=navMod&&typeof navMod.mode==='function'&&navMod.mode()==='gutter-css'"
    "&&document.documentElement.classList.contains('dwt-gutter-ok')"
    "&&!!document.querySelector('aside[class*=\"gutter\"]');"
    "if(!navEl&&!gutterOk)return!0;"
    "var d=window.dwt;if(!d)return!0;"
    "var k=Object.keys(d),n=0,i=0;for(;i<k.length;i++)if(k[i]!=='domObserver')n++;"
    "return n<1}catch(e){return!0}}"
    "function staleNav(){try{"
    "var m=window.dwt&&window.dwt.navigatorModule;"
    "return!(m&&typeof m.rev==='number'&&m.rev>=10)"
    "}catch(e){return!0}}"
    "function visProbe(el){try{"
    "if(!el)return{exists:!1,offsetParent:!1,display:\"\",w:0,h:0,top:0,left:0};"
    "var cs=window.getComputedStyle?getComputedStyle(el):null;"
    "var r=el.getBoundingClientRect?el.getBoundingClientRect():{width:0,height:0,top:0,left:0};"
    "return{exists:!0,offsetParent:!!el.offsetParent,display:cs?String(cs.display||\"\"):\"\","
    "w:Math.round(r.width||0),h:Math.round(r.height||0),top:Math.round(r.top||0),left:Math.round(r.left||0)}"
    "}catch(e){return{exists:!!el,offsetParent:!1,display:\"err\",w:0,h:0,top:0,left:0}}}"
    "function postStub(reason){try{"
    "var navEl=document.getElementById('dwt-nav');"
    "var gutEl=document.querySelector('aside[class*=\"gutter\"], aside.absolute.inset-y-0.left-12');"
    "var navMod=window.dwt&&window.dwt.navigatorModule;"
    "var mode=\"\";try{mode=navMod&&typeof navMod.mode==='function'?String(navMod.mode()||\"\"):\"\"}catch(e0){}"
    "var b=JSON.stringify({"
    "href:String(location.href||\"\"),"
    "reason:reason||\"boot-stub\","
    "ver:\"v41\","
    "toggle:!!document.getElementById('dwt-panel-toggle'),"
    "promptBar:!!document.getElementById('dwt-prompt-bar'),"
    "nav:!!navEl,"
    "navRev:(navMod&&typeof navMod.rev==='number'?navMod.rev:0),"
    "navMode:mode,"
    "gutterMode:mode==='gutter-css',"
    "nativeGutter:!!gutEl,"
    "navVis:visProbe(navEl),"
    "gutterVis:visProbe(gutEl),"
    "autoScrollSweep:!1,"
    "liveBoot:!!window.__dwtLiveBoot,"
    "glassBoot:!!window.__dwtGlassBoot,"
    "dwt:!!window.dwt,t:Date.now()"
    "});"
    "fetch('http://127.0.0.1:5179/dev/bridge/verify',{"
    "method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},"
    "body:b,mode:'cors',keepalive:!0}).catch(function(){});"
    "fetch('http://127.0.0.1:5181/dev/bridge/verify',{"
    "method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},"
    "body:b,mode:'cors',keepalive:!0}).catch(function(){});"
    "try{if(navigator.sendBeacon)navigator.sendBeacon("
    "'http://127.0.0.1:5181/dev/bridge/verify',"
    "new Blob([b],{type:'text/plain;charset=UTF-8'}))}catch(e2){}"
    "}catch(e){}}"
    "var attempt=0;"
    "function go(){"
    "attempt++;"
    "var u='http://127.0.0.1:5179/dev/live-boot.js?t='+Date.now()+'&a='+attempt;"
    "fetch(u,{cache:'no-store',mode:'cors'})"
    ".then(function(r){if(!r.ok)throw new Error(String(r.status));return r.text()})"
    ".then(function(c){(0,eval)(c+String.fromCharCode(10)+'//# sourceURL='+u);"
    "postStub('boot-stub-eval-ok')})"
    ".catch(function(err){"
    "postStub('boot-stub-fetch-fail');"
    "if(attempt<5){setTimeout(go,800*attempt);return}"
    "var s=document.createElement('script');s.src=u;s.async=!0;"
    "s.onerror=function(){postStub('boot-stub-script-onerror')};"
    "(document.head||document.documentElement).appendChild(s)})"
    "}"
    "function ensureWatch(){"
    "if(window.__dwtBootStubWatch)return;"
    "window.__dwtBootStubWatch=1;"
    "setInterval(function(){"
    "postStub(inc()||staleNav()?'boot-stub-watch-inc':'boot-stub-watch-ok');"
    "if(inc()||staleNav()){"
    "if(window.__dwtBootLoading)return;"
    "try{delete window.__dwtLiveBoot}catch(e){window.__dwtLiveBoot=!1}"
    "window.__dwtVerifyScheduled=!1;"
    "attempt=0;go()"
    "}"
    "},4000)}"
    "ensureWatch();"
    "if(window.__dwtLiveBoot&&!inc()&&!staleNav()){"
    "postStub('boot-stub-complete');"
    # Force one live-boot re-pull so accept can capture navVis + stable probe.
    "if(!window.__dwtNavVisForcedAt||Date.now()-window.__dwtNavVisForcedAt>15000){"
    "window.__dwtNavVisForcedAt=Date.now();"
    "try{delete window.__dwtLiveBoot}catch(e3){window.__dwtLiveBoot=!1}"
    "window.__dwtVerifyScheduled=!1;attempt=0;go()"
    "}"
    "return}"
    "if(window.__dwtBootLoading){postStub('boot-stub-inflight');return}"
    "window.__dwtGlassBoot=!0;"
    "try{delete window.__dwtLiveBoot}catch(e){window.__dwtLiveBoot=!1}"
    "window.__dwtVerifyScheduled=!1;"
    "postStub('boot-stub-fetch');"
    "go();"
    "})();"
)
BROKEN_BOOT_MARK = "c+'\\n//# sourceURL='+u"
FIXED_BOOT_MARK = "String.fromCharCode(10)+'//# sourceURL='"
V36_BOOT_MARK = "ver:'v36'"
V37_BOOT_MARK = "ver:'v37'"
V38_BOOT_MARK = "ver:'v38'"
V39_BOOT_MARK = "ver:'v39'"
STALE_NAV_MARK = "staleNav()"
STALE_NAV_REV6_MARK = "m.rev>=6"
STALE_NAV_REV7_MARK = "m.rev>=7"
STALE_NAV_REV9_MARK = "m.rev>=9"
STALE_NAV_REV10_MARK = "m.rev>=10"

METHOD_ANCHOR = "injectColorSchemePreferenceForState(e){"

# Legacy fallback (pre-reinstall minify names). Discovery prefers live main.js import.
ELECTRON_IMPORT = (
    'import{app as Pj,BrowserWindow as hFe,WebContentsView as fFe,shell as GP,'
    'dialog as gFe,session as Aj,webContents as VP}from"electron";'
)
FS_IMPORT = 'import{appendFileSync as __dwtAFS}from"fs";'
V35_MARK = "__dwtV35Sweep"
V36_MARK = "__dwtV36Boot"
SWEEP_TICK_MARK = "sweep-tick"

# Broader: any http(s) URL whose string contains doubao|dola.
HOST_OK = (
    "const __dwtHostOk=u=>{try{"
    "if(!/^https?:/i.test(u))return!1;"
    "return/doubao|dola/i.test(String(u))"
    "}catch{return!1}};"
)

LOG_HELPER = (
    "const __dwtWlog=o=>{try{"
    "const line=JSON.stringify(o)+\"\\n\";"
    f'const paths=["{INJECT_LOG_PROJECT}",{INJECT_LOG_TEMP_ESM}];'
    "for(const p of paths){try{__dwtAFS(p,line)}catch{}}"
    "}catch{}};"
)

# Serialize Error for logs (message + stack); safe inside catch of executeJavaScript.
ERR_DETAIL = (
    "const __dwtErr=e=>{try{"
    "if(e==null)return{msg:\"err\",stack:null};"
    "return{"
    "msg:String(e&&e.message||e).slice(0,400),"
    "stack:e&&e.stack?String(e.stack).slice(0,600):null"
    "}}catch{return{msg:String(e).slice(0,200),stack:null}}}"
)


def _find_bv_electron_import(text: str) -> tuple[str, str, str]:
    """Return (import_statement, app_alias, webContents_alias) for BrowserView electron import."""
    matches = list(_BV_ELECTRON_IMPORT_RE.finditer(text))
    if not matches:
        if ELECTRON_IMPORT in text:
            return ELECTRON_IMPORT, "Pj", "VP"
        raise SystemExit(
            "main.js: BrowserView electron import not found for v3.6 bootstrap"
        )
    anchor = text.find("async createBrowserView")
    if anchor < 0:
        anchor = text.find("BrowserViewMainService")
    best = matches[0]
    best_dist = abs(best.start() - max(anchor, 0))
    for m in matches:
        inner = m.group(1)
        if "webContents as" not in inner or "app as" not in inner:
            continue
        dist = abs(m.start() - max(anchor, 0))
        # Prefer import that appears before createBrowserView and closest to it.
        if anchor >= 0 and m.start() <= anchor:
            dist = anchor - m.start()
        if dist < best_dist or (
            "webContents as" in m.group(1) and "webContents as" not in best.group(1)
        ):
            best, best_dist = m, dist
    inner = best.group(1)
    app_m = re.search(r"\bapp as ([A-Za-z_$][\w$]*)", inner)
    wc_m = re.search(r"\bwebContents as ([A-Za-z_$][\w$]*)", inner)
    if not app_m or not wc_m:
        raise SystemExit(
            "main.js: could not parse app/webContents aliases from BrowserView electron import"
        )
    return best.group(0), app_m.group(1), wc_m.group(1)


def _global_bootstrap(app_alias: str, wc_alias: str) -> str:
    """Eager global sweep — runs at module load; does NOT wait for BrowserView hooks."""
    return (
        f"{FS_IMPORT}"
        ";(()=>{try{"
        f"if(globalThis.{V36_MARK})return;globalThis.{V36_MARK}=1;"
        f"globalThis.{V35_MARK}=1;"
        f"{HOST_OK}"
        f"{LOG_HELPER}"
        f"{ERR_DETAIL};"
        f'const __dwtBoot="{BOOT_JS}";'
        "const __dwtInj=(wc,src)=>{try{"
        "if(!wc||wc.isDestroyed())return;"
        "const n=String(wc.getURL()||\"\");"
        "if(!__dwtHostOk(n))return;"
        "__dwtWlog({t:Date.now(),src:String(src||\"\"),url:n,id:wc.id,ok:!1,"
        "err:\"attempt\",ver:\"v36\",bootLen:__dwtBoot.length});"
        "wc.executeJavaScript(__dwtBoot)"
        ".then(()=>__dwtWlog({t:Date.now(),src:String(src||\"\"),url:n,id:wc.id,"
        "ok:!0,err:null,ver:\"v36\"}))"
        ".catch(e=>{const d=__dwtErr(e);__dwtWlog({t:Date.now(),src:String(src||\"\"),"
        "url:n,id:wc.id,ok:!1,err:d.msg,stack:d.stack,ver:\"v36\","
        "bootLen:__dwtBoot.length})})"
        "}catch(e){const d=__dwtErr(e);__dwtWlog({t:Date.now(),"
        "src:String(src||\"\")+\"-throw\",err:d.msg,stack:d.stack,ver:\"v36\"})}};"
        "const __dwtTick=()=>{try{"
        f"const list={wc_alias}.getAllWebContents();"
        "const urls=[];let match=0;"
        "for(const wc of list){"
        "if(wc.isDestroyed())continue;"
        "let u=\"\";try{u=String(wc.getURL()||\"\")}catch{}"
        "if(u)urls.push({id:wc.id,url:u.slice(0,180)});"
        "if(__dwtHostOk(u)){match++;__dwtInj(wc,\"v36-sweep\")}"
        "}"
        "__dwtWlog({t:Date.now(),src:\"sweep-tick\",all:list.length,match,"
        "urls:urls.slice(0,50),ver:\"v36\"})"
        "}catch(e){const d=__dwtErr(e);__dwtWlog({t:Date.now(),src:\"sweep-tick-err\","
        "err:d.msg,stack:d.stack,ver:\"v36\"})}};"
        "__dwtTick();"
        "setInterval(__dwtTick,3e3);"
        f"try{{{app_alias}.on(\"web-contents-created\",(e,wc)=>{{"
        "const go=()=>__dwtInj(wc,\"v36-created\");"
        "try{wc.on(\"did-finish-load\",go)}catch{}"
        "try{wc.on(\"did-navigate\",go)}catch{}"
        "try{wc.on(\"did-navigate-in-page\",go)}catch{}"
        "try{wc.on(\"dom-ready\",go)}catch{}"
        "})}catch(e){const d=__dwtErr(e);__dwtWlog({t:Date.now(),src:\"v36-hook-err\","
        "err:d.msg,stack:d.stack})}"
        "__dwtWlog({t:Date.now(),src:\"v36-boot\",msg:\"global sweep armed\","
        "bootLen:__dwtBoot.length})"
        "}catch(e){try{__dwtAFS(\""
        + INJECT_LOG_PROJECT
        + '",JSON.stringify({t:Date.now(),src:"v36-boot-fail",err:String(e)})+"\\n")'
        "}catch{}}})();"
    )


def _wc_helper() -> str:
    return (
        "__dwtInjectWc(t,src){"
        "try{"
        "if(!t||t.isDestroyed())return;"
        "const n=String(t.getURL()||\"\");"
        "if(!(/^https?:/i.test(n)&&/doubao|dola/i.test(n)))return;"
        "const _log=(ok,err,extra)=>{"
        "try{"
        "const line=JSON.stringify(Object.assign({"
        "t:Date.now(),src:String(src||\"\"),url:n,id:t.id,"
        "ok:!!ok,err:err?String(err&&err.message||err).slice(0,400):null,"
        "ver:\"v36\""
        "},extra||{}))+\"\\n\";"
        f'for(const p of["{INJECT_LOG_PROJECT}",{INJECT_LOG_TEMP_ESM}])'
        "{try{__dwtAFS(p,line)}catch{"
        "try{require(\"fs\").appendFileSync(p,line)}catch{}}"
        "}"
        "}catch{}"
        "};"
        f'const s="{BOOT_JS}";'
        "_log(!1,\"attempt\",{bootLen:s.length});"
        "t.executeJavaScript(s).then(()=>_log(!0,null)).catch(e=>_log(!1,e,{"
        "stack:e&&e.stack?String(e.stack).slice(0,600):null,bootLen:s.length}));"
        "}catch{}"
        "}"
    )


def _method_body(wc_alias: str) -> str:
    return (
        f"{_wc_helper()}"
        "injectDwtLiveBootForState(e){"
        "try{"
        "if(!this.__dwtInjectSweep){this.__dwtInjectSweep=1;this.__dwtAllWcSweep=1;"
        "this.__dwtV35StateSweep=1;"
        "setInterval(()=>{try{for(const st of this.browserViews.values())"
        "this.injectDwtLiveBootForState(st)}catch{}},3e3);"
        "setInterval(()=>{try{"
        f"const list={wc_alias}.getAllWebContents();"
        "for(const wc of list)this.__dwtInjectWc(wc,\"sweep-all\")"
        "}catch{}},3e3)}"
        "const t=e?.browserView?.webContents;"
        "if(t)this.__dwtInjectWc(t,\"state\");"
        "}catch{}"
        "}"
    )


# Defaults for module-level references (overwritten in patch_main with discovered aliases).
GLOBAL_BOOTSTRAP = _global_bootstrap("Pj", "VP")
WC_HELPER = _wc_helper()
METHOD_BODY = _method_body("VP")

OLD_BOOT_MARK = "if(window.__dwtLiveBoot||window.__dwtGlassBoot)return"
NEW_BOOT_MARK = "__dwtBootStubWatch"
ALWAYS_POST_MARK = "boot-stub-watch-ok"
BEACON_MARK = "sendBeacon"
LEGACY_FETCH_MARK = "if(window.__dwtLiveBoot&&!inc())return"
SWEEP_MARK = "__dwtInjectSweep"
ALL_WC_MARK = "__dwtAllWcSweep"
WC_HELPER_MARK = "__dwtInjectWc"
LOG_MARK = ".dwt-inject.log"
APEX_HOST_MARK = 'r==="doubao.com"'
PRELOAD_MARK = "dwt-glass-inject"
PRELOAD_HOST_APEX = 'host === "doubao.com"'
PRELOAD_PING_MARK = "preload-try"


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = path.with_name(path.name + f".dwt-bak-{stamp}")
    shutil.copy2(path, bak)
    return bak


def _method_span(text: str) -> tuple[int, int]:
    """Return [start, end) covering __dwtInjectWc (optional) + injectDwtLiveBootForState."""
    inj = text.find("injectDwtLiveBootForState(e){")
    if inj < 0:
        raise SystemExit("main.js: injectDwtLiveBootForState not found")
    end = text.find(METHOD_ANCHOR, inj)
    if end < 0:
        raise SystemExit("main.js: cannot locate inject method span end")
    hs = text.rfind("__dwtInjectWc(t,src){", 0, inj)
    if hs >= 0 and text.find(METHOD_ANCHOR, hs) == end and inj - hs < 5000:
        start = hs
    else:
        start = inj
    return start, end


def _extract_dq_string(text: str, start: int) -> tuple[str, int, int] | None:
    """Return (value, open_quote_idx, close_quote_idx+1) for a JS "..." starting at start."""
    if start < 0 or start >= len(text) or text[start] != '"':
        return None
    i = start + 1
    out: list[str] = []
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            if i + 1 >= len(text):
                return None
            out.append(ch + text[i + 1])
            i += 2
            continue
        if ch == '"':
            return "".join(out), start, i + 1
        out.append(ch)
        i += 1
    return None


def _replace_embedded_boot_strings(text: str) -> tuple[str, int]:
    """Replace any double-quoted string that looks like the dwt boot IIFE with BOOT_JS."""
    markers = (
        "__dwtBootStubWatch",
        "boot-stub-fetch",
        "127.0.0.1:5179/dev/live-boot.js",
    )
    count = 0
    i = 0
    out: list[str] = []
    while i < len(text):
        if text[i] == '"' and any(m in text[i : i + 2500] for m in markers):
            # Only attempt if this string likely starts with the boot IIFE
            if text.startswith('"(function(){', i) or text.startswith('"(function(){function inc()', i):
                parsed = _extract_dq_string(text, i)
                if parsed and all(m in parsed[0] for m in ("boot-stub", "live-boot.js")):
                    _val, a, b = parsed
                    # Skip if already fixed (v37+ staleNav)
                    if (
                        FIXED_BOOT_MARK in _val
                        and V39_BOOT_MARK in _val
                        and STALE_NAV_REV10_MARK in _val
                        and BROKEN_BOOT_MARK not in _val
                    ):
                        out.append(text[i:b])
                        i = b
                        continue
                    out.append('"' + BOOT_JS + '"')
                    count += 1
                    i = b
                    continue
        out.append(text[i])
        i += 1
    return "".join(out), count


def _apply_hook_variants(
    text: str, variants: list[tuple[str, str]], label: str
) -> tuple[str, bool]:
    """Apply first matching (old→new) hook pair. Returns (text, changed)."""
    for _old, new in variants:
        if new in text:
            print(f"main.js: {label} inject already present")
            return text, False
    for old, new in variants:
        if old in text:
            text = text.replace(old, new, 1)
            print(f"main.js: hooked {label} → injectDwtLiveBootForState")
            return text, True
    print(f"main.js: WARNING {label} hook pattern not found")
    return text, False


def _ensure_global_bootstrap(
    text: str, electron_import: str, bootstrap: str
) -> tuple[str, bool]:
    """Insert or upgrade FS import + eager sweep after BrowserView electron import."""
    has_v35 = V35_MARK in text and SWEEP_TICK_MARK in text and "__dwtAFS" in text
    has_v36 = V36_MARK in text and FIXED_BOOT_MARK in text and V36_BOOT_MARK in text
    # Broken partial upgrade: v36 IIFE + leftover v35-sweep tick (cut at BOOT_JS `})();`).
    dup_tick = text.count("setInterval(__dwtTick") > 1 or (
        '"v35-sweep"' in text and '"v36-sweep"' in text
    )
    if has_v36 and BROKEN_BOOT_MARK not in text and not dup_tick:
        return text, False
    if electron_import not in text:
        raise SystemExit("main.js: BrowserView electron import not found for v3.6 bootstrap")

    if (has_v35 and not has_v36) or dup_tick:
        # Replace the existing IIFE bootstrap block after FS import.
        # Pattern: import{appendFileSync as __dwtAFS}from"fs";(()=>{try{if(globalThis.__dwtV35Sweep)...
        # IMPORTANT: BOOT_JS itself ends with `})();` — never take the first match after
        # V35_MARK. Anchor on the boot log line (`v35-boot` / `v36-boot` / sweep armed).
        fs_at = text.find(FS_IMPORT)
        if fs_at < 0:
            raise SystemExit("main.js: __dwtAFS import missing while V35 mark present")
        mark_at = text.find(V35_MARK, fs_at)
        if mark_at < 0:
            raise SystemExit("main.js: V35 mark position not found for upgrade")
        end_anchor = -1
        for anchor in (
            'src:"v36-boot"',
            "src:\"v36-boot\"",
            'src:"v35-boot"',
            "src:\"v35-boot\"",
            "global sweep armed",
        ):
            end_anchor = text.find(anchor, mark_at)
            if end_anchor >= 0:
                break
        if end_anchor < 0:
            raise SystemExit("main.js: cannot find bootstrap end anchor for upgrade")
        end = text.find("})();", end_anchor)
        if end < 0:
            raise SystemExit("main.js: cannot find V35 bootstrap IIFE end after anchor")
        end = end + len("})();")
        text = text[:fs_at] + bootstrap + text[end:]
        return text, True

    if not has_v35:
        text = text.replace(electron_import, electron_import + bootstrap, 1)
        return text, True

    # has_v36 but still broken boot somewhere — fall through to string replace
    return text, False


def patch_main() -> None:
    text = MAIN.read_text(encoding="utf-8")
    changed = False
    electron_import, app_alias, wc_alias = _find_bv_electron_import(text)
    bootstrap = _global_bootstrap(app_alias, wc_alias)
    method_body = _method_body(wc_alias)
    print(
        f"main.js: BrowserView electron aliases app={app_alias} webContents={wc_alias}"
    )

    text, ch = _apply_hook_variants(text, HOOK_VARIANTS, "did-finish-load")
    if ch:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        changed = True

    text, ch = _apply_hook_variants(text, FOCUS_HOOK_VARIANTS, "webContents focus")
    if ch:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        changed = True

    text, ch = _apply_hook_variants(text, NAV_HOOK_VARIANTS, "did-navigate")
    if ch:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        changed = True

    text, ch = _apply_hook_variants(text, NAV_INPAGE_VARIANTS, "did-navigate-in-page")
    if ch:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        changed = True

    # v3.6 eager global bootstrap (must run even when no BrowserView event fires)
    text2, boot_added = _ensure_global_bootstrap(text, electron_import, bootstrap)
    if boot_added:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        text = text2
        changed = True
        print("main.js: inserted/upgraded v3.6 eager global sweep (fixed boot + err detail)")
    else:
        text = text2
        print("main.js: v3.6 global sweep already present")

    # Always rewrite any broken/old embedded boot payloads (global + method).
    text3, n_boot = _replace_embedded_boot_strings(text)
    if n_boot:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        text = text3
        changed = True
        print(f"main.js: replaced {n_boot} embedded boot string(s) with v3.6 BOOT_JS")
    else:
        text = text3

    if "injectDwtLiveBootForState(e){" not in text:
        if METHOD_ANCHOR not in text:
            raise SystemExit("main.js: injectColorSchemePreferenceForState not found")
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        text = text.replace(METHOD_ANCHOR, method_body + METHOD_ANCHOR, 1)
        MAIN.write_text(text, encoding="utf-8")
        print("main.js: inserted injectDwtLiveBootForState + __dwtInjectWc (v3.6)")
        return

    start, end = _method_span(text)
    old_method = text[start:end]
    need_method_upgrade = not (
        NEW_BOOT_MARK in old_method
        and "boot-stub-fetch" in old_method
        and ALWAYS_POST_MARK in old_method
        and "ensureWatch()" in old_method
        and BEACON_MARK in old_method
        and SWEEP_MARK in old_method
        and ALL_WC_MARK in old_method
        and WC_HELPER_MARK in old_method
        and LOG_MARK in old_method
        and f"{wc_alias}.getAllWebContents" in old_method
        and "/doubao|dola/i" in old_method
        and "__dwtAFS" in old_method
        and FIXED_BOOT_MARK in old_method
        and STALE_NAV_REV10_MARK in old_method
        and BROKEN_BOOT_MARK not in old_method
    )
    if need_method_upgrade:
        if not changed:
            bak = backup(MAIN)
            print("main.js backup:", bak)
        text = text[:start] + method_body + text[end:]
        changed = True
        print("main.js: upgraded injectDwtLiveBootForState (boot-stub v3.6)")
    else:
        print("main.js: inject method already v3.6")

    if BROKEN_BOOT_MARK in text:
        raise SystemExit("main.js: broken \\\\n boot mark still present after upgrade")

    if changed:
        MAIN.write_text(text, encoding="utf-8")
        print("main.js: wrote v3.6 patch")
    else:
        print("main.js: no method/hook changes needed")


def _preload_host_block_old() -> str:
    return (
        "    function onDoubaoHost() {\n"
        '      const host = String((location && location.hostname) || "").toLowerCase();\n'
        "      return (\n"
        '        host === "www.doubao.com" ||\n'
        '        host === "www.dola.com" ||\n'
        '        host.endsWith(".doubao.com") ||\n'
        '        host.endsWith(".dola.com")\n'
        "      );\n"
        "    }\n"
    )


def _preload_host_block_new() -> str:
    return (
        "    function onDoubaoHost() {\n"
        '      const href = String((location && location.href) || "");\n'
        '      const host = String((location && location.hostname) || "").toLowerCase();\n'
        "      if (/^https?:/i.test(href) && /doubao|dola/i.test(href)) return true;\n"
        "      return (\n"
        '        host === "doubao.com" ||\n'
        '        host === "dola.com" ||\n'
        '        host === "www.doubao.com" ||\n'
        '        host === "www.dola.com" ||\n'
        '        host.endsWith(".doubao.com") ||\n'
        '        host.endsWith(".dola.com")\n'
        "      );\n"
        "    }\n"
    )


PRELOAD_TRY_V36_MARK = "preload-boot-fail"


def _preload_ping_and_try_block() -> str:
    return (
        "    function pingPreload(reason, extra) {\n"
        "      try {\n"
        "        var b = JSON.stringify({\n"
        "          href: String((location && location.href) || \"\"),\n"
        "          reason: reason || \"preload-try\",\n"
        "          host: String((location && location.hostname) || \"\"),\n"
        "          ver: \"v36\",\n"
        "          t: Date.now(),\n"
        "          ...(extra || {})\n"
        "        });\n"
        "        fetch(\"http://127.0.0.1:5179/dev/bridge/verify\", {\n"
        "          method: \"POST\",\n"
        "          headers: { \"Content-Type\": \"application/json\" },\n"
        "          body: b,\n"
        "          mode: \"cors\",\n"
        "          keepalive: true\n"
        "        }).catch(function () {});\n"
        "        try {\n"
        "          if (navigator.sendBeacon) {\n"
        "            navigator.sendBeacon(\n"
        "              \"http://127.0.0.1:5179/dev/bridge/verify\",\n"
        "              new Blob([b], { type: \"application/json\" })\n"
        "            );\n"
        "          }\n"
        "        } catch (e2) {}\n"
        "      } catch (e) {}\n"
        "    }\n"
        "    function tryInject() {\n"
        "      var ok = onDoubaoHost();\n"
        "      pingPreload(ok ? \"preload-try\" : \"preload-skip-host\", {\n"
        "        bootLen: typeof boot === \"string\" ? boot.length : -1\n"
        "      });\n"
        "      if (!ok) return;\n"
        "      try {\n"
        "        var p = webFrame.executeJavaScript(boot);\n"
        "        if (p && typeof p.then === \"function\") {\n"
        "          p.then(function () {\n"
        "            pingPreload(\"preload-boot-ok\");\n"
        "          }).catch(function (err) {\n"
        "            pingPreload(\"preload-boot-fail\", {\n"
        "              err: String(err && err.message || err).slice(0, 300)\n"
        "            });\n"
        "          });\n"
        "        }\n"
        "      } catch (e) {\n"
        "        pingPreload(\"preload-boot-throw\", {\n"
        "          err: String(e && e.message || e).slice(0, 300)\n"
        "        });\n"
        "      }\n"
        "    }\n"
    )


def _ensure_preload_ping(text: str) -> str:
    """Beacon on every tryInject so serve sees preload even if boot eval fails."""
    if PRELOAD_TRY_V36_MARK in text and PRELOAD_PING_MARK in text:
        return text
    new = _preload_ping_and_try_block()
    # Replace existing ping+tryInject block or bare tryInject
    import re

    pat = re.compile(
        r"    function (?:pingPreload|tryInject)\([\s\S]*?"
        r"    function tryInject\(\) \{[\s\S]*?\n    \}\n",
        re.M,
    )
    if PRELOAD_PING_MARK in text and pat.search(text):
        return pat.sub(new, text, count=1)
    old = (
        "    function tryInject() {\n"
        "      if (!onDoubaoHost()) return;\n"
        "      webFrame.executeJavaScript(boot);\n"
        "    }\n"
    )
    old_ping = (
        "    function tryInject() {\n"
        "      var ok = onDoubaoHost();\n"
        "      pingPreload(ok ? \"preload-try\" : \"preload-skip-host\");\n"
        "      if (!ok) return;\n"
        "      webFrame.executeJavaScript(boot);\n"
        "    }\n"
    )
    if old_ping in text:
        # Replace from pingPreload through tryInject
        ping_at = text.find("    function pingPreload(")
        try_end = text.find(old_ping) + len(old_ping)
        if ping_at >= 0 and ping_at < try_end:
            return text[:ping_at] + new + text[try_end:]
        return text.replace(old_ping, new, 1)
    if old not in text:
        raise SystemExit("preload: tryInject block not found for ping upgrade")
    return text.replace(old, new, 1)


def _force_preload_boot(text: str) -> tuple[str, bool]:
    """Rewrite const boot = \"...\" to current BOOT_JS when missing v3.7 marks."""
    if (
        FIXED_BOOT_MARK in text
        and V39_BOOT_MARK in text
        and STALE_NAV_REV10_MARK in text
        and BROKEN_BOOT_MARK not in text
        and NEW_BOOT_MARK in text
    ):
        return text, False
    marker = "const boot ="
    i = text.find(marker)
    if i < 0:
        raise SystemExit("preload: const boot not found")
    # Find opening quote after const boot =
    q = text.find('"', i)
    if q < 0:
        raise SystemExit("preload: boot string quote not found")
    parsed = _extract_dq_string(text, q)
    if not parsed:
        raise SystemExit("preload: cannot parse boot double-quoted string")
    _val, a, b = parsed
    new_block = f'const boot =\n      "{BOOT_JS}";'
    # Replace from const boot = through closing quote
    text = text[:i] + new_block + text[b:]
    return text, True


def _preload_inject_iife() -> str:
    """Full dwt-glass-inject IIFE for a clean (reinstalled) preload-browser.js."""
    host = _preload_host_block_new()
    ping_try = _preload_ping_and_try_block()
    return (
        "\n;(function () {\n"
        f"  /* {PRELOAD_MARK} */\n"
        '  try {\n'
        '    const { webFrame } = require("electron");\n'
        f"{host}"
        f'    const boot =\n      "{BOOT_JS}";\n'
        f"{ping_try}"
        "    tryInject();\n"
        '    window.addEventListener("DOMContentLoaded", tryInject);\n'
        '    window.addEventListener("pageshow", tryInject);\n'
        '    window.addEventListener("focus", tryInject);\n'
        '    document.addEventListener("visibilitychange", () => {\n'
        '      if (document.visibilityState === "visible") tryInject();\n'
        "    });\n"
        "    if (!window.__dwtPreloadInjectInterval) {\n"
        "      window.__dwtPreloadInjectInterval = setInterval(tryInject, 5000);\n"
        "    }\n"
        '  } catch (e) {\n'
        '    console.error("[dwt-glass-inject]", e);\n'
        "  }\n"
        "})();\n"
    )


def _ensure_preload_inject_block(text: str) -> tuple[str, bool]:
    if PRELOAD_MARK in text:
        return text, False
    block = _preload_inject_iife()
    # Prefer insert before trailing sourceMappingURL comment if present.
    marker = "\n//# sourceMappingURL="
    idx = text.find(marker)
    if idx >= 0:
        text = text[:idx] + block + text[idx:]
    else:
        text = text.rstrip() + block
    return text, True


def patch_preload() -> None:
    text = PRELOAD.read_text(encoding="utf-8")
    text, inserted = _ensure_preload_inject_block(text)
    if inserted:
        bak = backup(PRELOAD)
        print("preload backup:", bak)
        PRELOAD.write_text(text, encoding="utf-8")
        text = PRELOAD.read_text(encoding="utf-8")
        print("preload: inserted fresh dwt-glass-inject IIFE (post-reinstall)")
    if PRELOAD_MARK not in text:
        raise SystemExit("preload-browser.js missing dwt-glass-inject block")

    text2, boot_changed = _force_preload_boot(text)
    if boot_changed:
        bak = backup(PRELOAD)
        print("preload backup:", bak)
        text = text2
        PRELOAD.write_text(text, encoding="utf-8")
        text = PRELOAD.read_text(encoding="utf-8")
        print("preload: upgraded boot to v3.6 (fromCharCode + ver)")
    else:
        text = text2
        print("preload: already boot-stub v3.6")

    # Always refresh host matcher to href-contains form
    new_host = _preload_host_block_new()
    if " /doubao|dola/i.test(href)" in text or "/doubao|dola/i.test(href)" in text:
        print("preload: broad href host match already present")
    else:
        old_host = _preload_host_block_old()
        # Also match current apex-expanded block
        old_apex = (
            "    function onDoubaoHost() {\n"
            '      const host = String((location && location.hostname) || "").toLowerCase();\n'
            "      return (\n"
            '        host === "doubao.com" ||\n'
            '        host === "dola.com" ||\n'
            '        host === "www.doubao.com" ||\n'
            '        host === "www.dola.com" ||\n'
            '        host.endsWith(".doubao.com") ||\n'
            '        host.endsWith(".dola.com")\n'
            "      );\n"
            "    }\n"
        )
        bak = backup(PRELOAD)
        print("preload backup:", bak)
        if old_apex in text:
            text = text.replace(old_apex, new_host, 1)
        elif old_host in text:
            text = text.replace(old_host, new_host, 1)
        else:
            print("preload: WARNING onDoubaoHost block not found for broad upgrade")
        PRELOAD.write_text(text, encoding="utf-8")
        text = PRELOAD.read_text(encoding="utf-8")
        print("preload: broadened onDoubaoHost (href contains doubao|dola)")

    if 'document.visibilityState === "visible"' in text and 'window.addEventListener("focus", tryInject)' in text:
        print("preload: focus/visibility inject already present")
    elif PRELOAD_LISTENERS_OLD not in text:
        raise SystemExit("preload: listener block not found for focus/visibility upgrade")
    else:
        bak = backup(PRELOAD)
        print("preload backup:", bak)
        text = text.replace(PRELOAD_LISTENERS_OLD, PRELOAD_LISTENERS_NEW, 1)
        PRELOAD.write_text(text, encoding="utf-8")
        text = PRELOAD.read_text(encoding="utf-8")
        print("preload: added focus + visibilitychange inject")

    interval_mark = "__dwtPreloadInjectInterval"
    if interval_mark not in text:
        interval_snip = (
            f"    if (!window.{interval_mark}) {{\n"
            f"      window.{interval_mark} = setInterval(tryInject, 5000);\n"
            "    }\n"
        )
        anchor = '    window.addEventListener("focus", tryInject);\n'
        if anchor not in text:
            raise SystemExit("preload: focus listener missing; cannot add interval")
        bak = backup(PRELOAD)
        print("preload backup:", bak)
        text = text.replace(anchor, anchor + interval_snip, 1)
        PRELOAD.write_text(text, encoding="utf-8")
        text = PRELOAD.read_text(encoding="utf-8")
        print("preload: added 5s tryInject interval")
    else:
        print("preload: inject interval already present")

    if PRELOAD_TRY_V36_MARK in text and PRELOAD_PING_MARK in text:
        print("preload: ping + boot-fail beacon already v3.6")
    else:
        bak = backup(PRELOAD)
        print("preload backup:", bak)
        text = _ensure_preload_ping(text)
        PRELOAD.write_text(text, encoding="utf-8")
        print("preload: added/upgraded ping + boot-fail beacon (v3.6)")

    if BROKEN_BOOT_MARK in PRELOAD.read_text(encoding="utf-8"):
        raise SystemExit("preload: broken \\\\n boot mark still present after upgrade")


def main() -> None:
    if not MAIN.exists():
        raise SystemExit(f"missing {MAIN}")
    if not PRELOAD.exists():
        raise SystemExit(f"missing {PRELOAD}")
    # Sanity: BOOT_JS must parse as a Function body (no outer-quote escape bugs).
    import json
    import subprocess

    chk = subprocess.run(
        [
            "node",
            "-e",
            "try{new Function("
            + json.dumps(BOOT_JS)
            + ");console.log('BOOT_JS_PARSE_OK')}catch(e){console.log('BOOT_JS_PARSE_FAIL',e.message);process.exit(2)}",
        ],
        capture_output=True,
        text=True,
    )
    print(chk.stdout.strip() or chk.stderr.strip())
    if chk.returncode != 0:
        raise SystemExit("BOOT_JS failed node parse check; aborting patch")

    patch_main()
    patch_preload()
    log_disp = INJECT_LOG_PROJECT.replace("\\\\", "\\")
    print(
        "DONE v3.6. Restart Cursor once so main.js loads fixed boot stub + richer logs. "
        "After restart, existing Doubao Glass tab should get executeJavaScript ok:true "
        "within ~3s (sweep-tick match>=1). Preload path also fixed; Glass refresh helps "
        "preload ping without restart, but main.js sweep requires restart. "
        "Expect ver:v36 lines in "
        + log_disp
        + " and %TEMP%\\dwt-inject.log. "
        "Keep python dev/serve.py running on 5179."
    )


if __name__ == "__main__":
    main()
