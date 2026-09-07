# 开发服务器：带 no-cache 头，固定服务本目录（改完代码刷新即生效）
# 用法: python serve.py [端口]
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8399
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass  # 安静模式


if __name__ == "__main__":
    http.server.test(HandlerClass=NoCacheHandler, port=PORT, bind="127.0.0.1")
    print(f"serving http://127.0.0.1:{PORT}/  (directory: {DIRECTORY})")
