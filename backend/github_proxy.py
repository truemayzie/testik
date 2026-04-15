"""
github_proxy.py — проксирование запросов к Anthropic через GitHub Actions
"""

import os
import json
import time
import uuid
import socket
import threading
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")
CALLBACK_PORT = 9876
CALLBACK_SECRET = os.getenv("PROXY_SECRET", "ref-ai-secret-2024")
SERVER_URL = "https://ref-ai.ru/proxy-callback"

_responses: dict = {}
_events: dict = {}


class CallbackHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        secret = self.headers.get("X-Proxy-Secret", "")
        if secret != CALLBACK_SECRET:
            self.send_response(403)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        request_id = self.path.strip("/").split("/")[-1]

        try:
            data = json.loads(body)
            if "content" in data:
                text = data["content"][0]["text"].strip()
            elif "error" in data:
                err = data["error"]
                text = f"ERROR: Claude API {err.get('type', 'error')}: {err.get('message', str(err))}"
            else:
                text = f"ERROR: Unexpected response keys: {list(data.keys())}"
            _responses[request_id] = text
        except Exception as e:
            _responses[request_id] = f"ERROR: parse failed: {e} | body: {body[:200]}"

        if request_id in _events:
            _events[request_id].set()

        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass


class ReusableTCPServer(HTTPServer):
    allow_reuse_address = True


def start_callback_server():
    try:
        server = ReusableTCPServer(("0.0.0.0", CALLBACK_PORT), CallbackHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        print(f"[Proxy] Callback сервер запущен на порту {CALLBACK_PORT}")
    except OSError as e:
        print(f"[Proxy] Callback сервер уже запущен или порт {CALLBACK_PORT} занят: {e}")


def ask_via_github(model: str, max_tokens: int, messages: list) -> str:
    request_id = uuid.uuid4().hex
    event = threading.Event()
    _events[request_id] = event

    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages
    })

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    payload = {
        "event_type": "anthropic-request",
        "client_payload": {
            "body": body,
            "callback_url": f"{SERVER_URL}/{request_id}",
            "secret": CALLBACK_SECRET
        }
    }

    resp = requests.post(
        f"https://api.github.com/repos/{GITHUB_REPO}/dispatches",
        headers=headers,
        json=payload
    )

    if resp.status_code != 204:
        raise Exception(f"Ошибка запуска workflow: {resp.status_code} {resp.text}")

    print(f"[Proxy] Workflow запущен, ждём ответ...")

    if not event.wait(timeout=300):
        raise Exception("Timeout: GitHub Actions не ответил за 5 минут")

    result = _responses.pop(request_id, None)
    _events.pop(request_id, None)

    if result and result.startswith("ERROR:"):
        raise Exception(result)

    return result


