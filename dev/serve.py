#!/usr/bin/env python3
"""Serve the extension root for the Cursor built-in browser UI preview.

Usage (from anywhere):
  python dev/serve.py

Then open http://127.0.0.1:5179/dev/preview.html

Also exposes a tiny cross-context bridge for preview popup ↔ Doubao live-boot:
  GET/POST /dev/bridge/bus
  GET/PUT  /dev/bridge/storage
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
_storage = None
_storage_path = os.path.join(ROOT, "dev", ".preview-storage.json")
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


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
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
    handler = partial(NoCacheHandler, directory=ROOT)
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print("UI preview: http://%s:%s/dev/preview.html" % (HOST, PORT))
    print("fixture:    http://%s:%s/dev/fixture.html" % (HOST, PORT))
    print("bridge:     http://%s:%s/dev/bridge/bus" % (HOST, PORT))
    print("live-boot:  http://%s:%s/dev/live-boot.js  (Cursor built-in: re-inject after refresh)" % (HOST, PORT))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
