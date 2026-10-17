#!/usr/bin/env python3
"""Serve the extension root for the Cursor built-in browser UI preview.

Usage (from anywhere):
  python dev/serve.py

Then open http://127.0.0.1:5179/dev/preview.html

Also exposes a tiny cross-context bridge for preview popup ↔ Doubao live-boot:
  GET/POST /dev/bridge/bus
  GET/PUT  /dev/bridge/storage
  GET/POST /dev/bridge/verify  (Glass live-boot acceptance beacon)
"""
import json
import os
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HOST = "127.0.0.1"
PORT = 5179

_lock = threading.Lock()
_seq = 0
_bus = []  # [{id, t, pkt}]
_bus_max = 200
_verify_last = None  # last live-boot acceptance payload from Glass page
_verify_history = []  # recent reports; GET prefers latest non-probe doubao.com/chat/
_verify_history_max = 50
_PROBE_REASONS = frozenset({"jsdom-critical-probe", "jsdom-probe", "probe"})
_storage = None
_storage_path = os.path.join(ROOT, "dev", ".preview-storage.json")
_verify_path = os.path.join(ROOT, "dev", ".verify-last.json")
_access_log_path = os.path.join(ROOT, "dev", ".serve-access.log")
_access_counts = {"live_boot_get": 0, "verify_post": 0, "verify_get": 0, "other": 0}
_file_cache = {}
_file_cache_lock = threading.Lock()
_boot_inflight = 0
_boot_inflight_lock = threading.Lock()
_BOOT_MAX_INFLIGHT = 4
# Tiny JS when serve is saturated — clears in-flight flags so next sweep can retry.
_BOOT_BUSY_JS = (
    b"(function(){try{window.__dwtBootLoading=false;"
    b"window.__dwtFullBootStarted=false;"
    b"window.__dwtFullBootRunning=false;}catch(e){}})();"
)

# One response = chrome-mock + cores + gear/prompt/nav/snip (avoids 8× fetch on 6-conn host).
# selection-tools = #dwt-snip-toggle (blue pin next to prompt chips); must not wait on full bundle
# because live-boot gate early-returns once uiReady (gear+prompt+nav) and skips full fetch.
_CRITICAL_BUNDLE_FILES = (
    "dev/chrome-mock.js",
    "content/core/selector-manager.js",
    "content/core/dom-observer.js",
    "content/core/reply-state.js",
    "content/core/captcha-detector.js",
    "content/features/debug-panel/module.js",
    "content/features/prompt-bar/module.js",
    "content/features/navigator/module.js",
    "content/features/selection-tools/module.js",
)
_critical_bundle_cache = None  # (mtimes_tuple, bytes)


def _cached_bytes(rel_path):
    """Serve hot boot files from memory to finish writes before clients hang."""
    abs_path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    try:
        mtime = os.path.getmtime(abs_path)
    except Exception:
        return None, None
    with _file_cache_lock:
        hit = _file_cache.get(abs_path)
        if hit and hit[0] == mtime:
            return hit[1], hit[2]
    try:
        with open(abs_path, "rb") as f:
            data = f.read()
    except Exception:
        return None, None
    ctype = "application/javascript; charset=utf-8"
    with _file_cache_lock:
        _file_cache[abs_path] = (mtime, data, ctype)
    return data, ctype


def _critical_bundle_bytes():
    """Concatenate critical boot scripts into a single JS payload."""
    global _critical_bundle_cache
    mtimes = []
    chunks = []
    for rel in _CRITICAL_BUNDLE_FILES:
        abs_path = os.path.join(ROOT, rel.replace("/", os.sep))
        try:
            mtimes.append(os.path.getmtime(abs_path))
        except Exception:
            mtimes.append(-1)
        data, _ctype = _cached_bytes(rel)
        if data is None:
            chunks.append(
                ("// missing: " + rel + "\n").encode("utf-8")
            )
            continue
        chunks.append(("// ----- " + rel + " -----\n").encode("utf-8"))
        chunks.append(data)
        if not data.endswith(b"\n"):
            chunks.append(b"\n")
    key = tuple(mtimes)
    if _critical_bundle_cache and _critical_bundle_cache[0] == key:
        return _critical_bundle_cache[1], "application/javascript; charset=utf-8"
    blob = b"".join(chunks)
    _critical_bundle_cache = (key, blob)
    return blob, "application/javascript; charset=utf-8"


_defaults = {
    "dwt_batch_lines": "请帮我写周报\n请总结今天的会议",
    "dwt_min_interval": 3,
    "dwt_reply_timeout": 180,
    "dwt_source_inspector": True,
    "dwt_reading_mark": True,
    "dwt_enter_swap": True,
    "dwt_debug_panel": True,
    "dwt_conv_manager": False,
    "dwt_chat_digest": False,
    "dwt_dev_hot_reload": False,
}


def _load_storage():
    global _storage
    if _storage is not None:
        return _storage
    try:
        with open(_storage_path, "r", encoding="utf-8") as f:
            _storage = json.load(f)
            if not isinstance(_storage, dict):
                _storage = dict(_defaults)
    except Exception:
        _storage = dict(_defaults)
        _save_storage()
    return _storage


def _save_storage():
    try:
        with open(_storage_path, "w", encoding="utf-8") as f:
            json.dump(_storage, f, ensure_ascii=False)
    except Exception:
        pass


def _is_probe_report(report):
    """jsdom / synthetic probes must not count as Glass Doubao acceptance."""
    if not isinstance(report, dict):
        return True
    reason = str(report.get("reason") or "")
    if reason in _PROBE_REASONS or "jsdom" in reason.lower() or "probe" in reason.lower():
        return True
    href = str(report.get("href") or "")
    if "/chat/probe" in href or href.endswith("/probe-critical"):
        return True
    return False


def _is_doubao_chat_report(report):
    if not isinstance(report, dict) or _is_probe_report(report):
        return False
    href = str(report.get("href") or "")
    return "doubao.com/chat/" in href and "/chat/probe" not in href


def _pick_verify_report():
    """GET prefers latest non-probe doubao.com/chat/ report; else latest non-probe; else None."""
    global _verify_last
    # Drop polluted last if it is only a jsdom probe.
    if _verify_last is not None and _is_probe_report(_verify_last):
        better = None
        for r in reversed(_verify_history):
            if _is_doubao_chat_report(r):
                better = r
                break
        if better is None:
            for r in reversed(_verify_history):
                if not _is_probe_report(r):
                    better = r
                    break
        _verify_last = better
    for r in reversed(_verify_history):
        if _is_doubao_chat_report(r):
            return r
    for r in reversed(_verify_history):
        if not _is_probe_report(r):
            return r
    if _verify_last is not None and not _is_probe_report(_verify_last):
        return _verify_last
    return None


def _persist_verify(report):
    """Disk mirror so GET/accept still works after serve wedge/restart."""
    if not isinstance(report, dict):
        return
    try:
        with open(_verify_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False)
    except Exception:
        pass


def _load_verify_disk():
    try:
        with open(_verify_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _clear_verify():
    global _verify_last, _verify_history
    _verify_last = None
    _verify_history = []
    try:
        if os.path.isfile(_verify_path):
            os.remove(_verify_path)
    except Exception:
        pass


def _hydrate_verify_from_disk():
    global _verify_last
    disk = _load_verify_disk()
    if disk is None:
        return
    if _verify_last is None or _is_probe_report(_verify_last):
        if not _is_probe_report(disk):
            _verify_last = disk
            _verify_history.append(disk)


class NoCacheHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 3  # drop abandoned Glass sockets fast (was 8; storms piled CLOSE_WAIT)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
        # Broad allow-list for Chromium PNA preflight from https Doubao Glass.
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Requested-With, Accept",
        )
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        super().end_headers()

    def log_message(self, fmt, *args):
        """Append access lines so Glass live-boot / verify traffic is auditable."""
        try:
            path = urlparse(getattr(self, "path", "") or "").path
            method = getattr(self, "command", "?")
            # OPTIONS preflight storms must not touch disk.
            if method == "OPTIONS":
                return
            key = "other"
            if method == "GET" and path == "/dev/live-boot.js":
                key = "live_boot_get"
            elif method == "POST" and path == "/dev/bridge/verify":
                key = "verify_post"
            elif method == "GET" and path == "/dev/bridge/verify":
                key = "verify_get"
            # Never take the bus/storage lock here — storms were serializing all GETs.
            counts = None
            try:
                if _lock.acquire(False):
                    try:
                        _access_counts[key] = int(_access_counts.get(key) or 0) + 1
                        counts = dict(_access_counts)
                    finally:
                        _lock.release()
            except Exception:
                counts = None
            if counts is None:
                return
            # Sample live_boot GETs heavily — disk append under flood wedges serve.
            if key == "live_boot_get" and (counts.get("live_boot_get") or 0) % 50 != 1:
                return
            if key == "other":
                return
            origin = (self.headers.get("Origin") or "").strip()
            referer = (self.headers.get("Referer") or "").strip()
            ua = (self.headers.get("User-Agent") or "").strip()[:80]
            extra = " origin=%s referer=%s ua=%s" % (
                json.dumps(origin, ensure_ascii=False),
                json.dumps(referer, ensure_ascii=False),
                json.dumps(ua, ensure_ascii=False),
            )
            line = "%s %s %s counts=%s%s\n" % (
                time.strftime("%H:%M:%S"),
                method,
                getattr(self, "path", ""),
                json.dumps(counts, separators=(",", ":")),
                extra,
            )
            with open(_access_log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass

    def do_OPTIONS(self):
        # Fast preflight — never touch disk/locks (storms used to wedge serve).
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Requested-With, Accept",
        )
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return {}

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/dev/bridge/bus":
            qs = parse_qs(parsed.query or "")
            after = int((qs.get("after") or ["0"])[0] or 0)
            wait_ms = int((qs.get("wait") or ["0"])[0] or 0)
            deadline = time.time() + max(0, min(wait_ms, 25000)) / 1000.0
            while True:
                with _lock:
                    items = [x for x in _bus if x["id"] > after]
                    if items or wait_ms <= 0 or time.time() >= deadline:
                        self._send_json(200, {"ok": True, "items": items})
                        return
                time.sleep(0.05)
            return

        if parsed.path == "/dev/bridge/storage":
            with _lock:
                data = dict(_load_storage())
            self._send_json(200, {"ok": True, "value": data})
            return

        if parsed.path == "/dev/bridge/verify":
            with _lock:
                # Prefer latest real Glass Doubao chat beacon; ignore jsdom probes.
                payload = _pick_verify_report()
                if payload is None:
                    disk = _load_verify_disk()
                    if disk is not None and not _is_probe_report(disk):
                        payload = disk
            self._send_json(200, {"ok": True, "report": payload})
            return

        # Fast-path boot JS (gate inlines critical UI so Glass needs 1 fetch, not 8+).
        if parsed.path in (
            "/dev/live-boot.js",
            "/dev/live-boot-full.js",
            "/dev/live-boot-critical.js",
        ):
            global _boot_inflight
            with _boot_inflight_lock:
                if _boot_inflight >= _BOOT_MAX_INFLIGHT:
                    # 200 + tiny JS (not 503): stub eval succeeds and clears flags;
                    # empty 503 left hung TCP slots under inject storms.
                    busy = _BOOT_BUSY_JS
                    self.send_response(200)
                    self.send_header("Content-Type", "application/javascript; charset=utf-8")
                    self.send_header("Content-Length", str(len(busy)))
                    self.send_header("Retry-After", "1")
                    self.send_header("X-Dwt-Boot", "busy")
                    self.end_headers()
                    self.wfile.write(busy)
                    return
                _boot_inflight += 1
            try:
                ctype = "application/javascript; charset=utf-8"
                if parsed.path == "/dev/live-boot-critical.js":
                    data, ctype = _critical_bundle_bytes()
                elif parsed.path == "/dev/live-boot.js":
                    # critical modules + gate: one response mounts gear/prompt/nav.
                    crit, _ = _critical_bundle_bytes()
                    gate, _ = _cached_bytes("dev/live-boot.js")
                    if crit is None or gate is None:
                        data = None
                    else:
                        data = (
                            b"// dwt-live-boot: critical-inline v45\n"
                            + crit
                            + b"\n// dwt-live-boot: gate\n"
                            + gate
                        )
                else:
                    rel = parsed.path.lstrip("/")
                    data, ctype = _cached_bytes(rel)
                if data is None:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("X-Dwt-Boot", "ok")
                self.end_headers()
                self.wfile.write(data)
            finally:
                with _boot_inflight_lock:
                    _boot_inflight = max(0, _boot_inflight - 1)
            return

        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/dev/bridge/bus":
            body = self._read_json()
            pkt = body.get("pkt")
            if not isinstance(pkt, dict):
                self._send_json(400, {"ok": False, "error": "pkt required"})
                return
            global _seq
            with _lock:
                _seq += 1
                item = {"id": _seq, "t": time.time(), "pkt": pkt}
                _bus.append(item)
                if len(_bus) > _bus_max:
                    del _bus[: len(_bus) - _bus_max]
            self._send_json(200, {"ok": True, "id": item["id"]})
            return

        if parsed.path == "/dev/bridge/verify":
            body = self._read_json()
            if not isinstance(body, dict):
                self._send_json(400, {"ok": False, "error": "json object required"})
                return
            # POST {"reset": true} clears probe/last so acceptance can start clean.
            if body.get("reset") is True:
                with _lock:
                    _clear_verify()
                self._send_json(200, {"ok": True, "cleared": True})
                return
            global _verify_last
            report = dict(body)
            report["receivedAt"] = time.time()
            with _lock:
                _verify_history.append(report)
                if len(_verify_history) > _verify_history_max:
                    del _verify_history[: len(_verify_history) - _verify_history_max]
                # Do not let jsdom probes overwrite a real Glass acceptance beacon.
                if _is_probe_report(report):
                    if _verify_last is None or _is_probe_report(_verify_last):
                        _verify_last = report
                else:
                    _verify_last = report
                    _persist_verify(report)
            self._send_json(200, {"ok": True})
            return

        self.send_error(404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path == "/dev/bridge/storage":
            body = self._read_json()
            items = body.get("items") or {}
            remove = body.get("remove") or []
            changes = {}
            with _lock:
                store = _load_storage()
                for k, v in items.items():
                    changes[k] = {"oldValue": store.get(k), "newValue": v}
                    store[k] = v
                for k in remove:
                    changes[k] = {"oldValue": store.get(k), "newValue": None}
                    store.pop(k, None)
                _save_storage()
            self._send_json(200, {"ok": True, "changes": changes, "value": dict(_load_storage())})
            return

        self.send_error(404)


def main():
    _hydrate_verify_from_disk()
    # Warm critical+gate so the first Glass storm hit does not stall on disk I/O.
    try:
        crit, _ = _critical_bundle_bytes()
        gate, _ = _cached_bytes("dev/live-boot.js")
        print(
            "boot-cache: critical=%sB gate=%sB inline=%sB"
            % (
                len(crit or b""),
                len(gate or b""),
                len(crit or b"") + len(gate or b""),
            )
        )
    except Exception as e:
        print("boot-cache warm failed:", e)
    handler = partial(NoCacheHandler, directory=ROOT)
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print("UI preview: http://%s:%s/dev/preview.html" % (HOST, PORT))
    print("fixture:    http://%s:%s/dev/fixture.html" % (HOST, PORT))
    print("bridge:     http://%s:%s/dev/bridge/bus" % (HOST, PORT))
    print("verify:     http://%s:%s/dev/bridge/verify" % (HOST, PORT))
    print("live-boot:  http://%s:%s/dev/live-boot.js  (critical-inline + gate)" % (HOST, PORT))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
