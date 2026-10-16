#!/usr/bin/env python3
"""Serve the extension root for the Cursor built-in browser UI preview.

Usage (from anywhere):
  python dev/serve.py

Then open http://127.0.0.1:5179/dev/preview.html
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HOST = "127.0.0.1"
PORT = 5179


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


def main():
    handler = partial(NoCacheHandler, directory=ROOT)
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print("UI preview: http://%s:%s/dev/preview.html" % (HOST, PORT))
    print("fixture:    http://%s:%s/dev/fixture.html" % (HOST, PORT))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
