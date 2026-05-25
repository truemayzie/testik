"""
Клиент Presenton API (self-host v1 или cloud v3).
https://docs.presenton.ai/
"""

from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def presenton_enabled() -> bool:
    return bool(_env("PRESENTON_URL") or _env("PRESENTON_API_URL"))


def _base_url() -> str:
    return (_env("PRESENTON_URL") or _env("PRESENTON_API_URL")).rstrip("/")


def _is_cloud() -> bool:
    return "presenton.ai" in _base_url() and _env("PRESENTON_API_KEY").startswith("sk-presenton")


def _auth_headers() -> dict[str, str]:
    if _is_cloud():
        return {
            "Authorization": f"Bearer {_env('PRESENTON_API_KEY')}",
            "Content-Type": "application/json",
        }
    user = _env("PRESENTON_AUTH_USER", _env("AUTH_USERNAME", "refai"))
    password = _env("PRESENTON_AUTH_PASSWORD", _env("AUTH_PASSWORD"))
    if not password:
        return {"Content-Type": "application/json"}
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
    }


def build_content_from_result(topic: str, work_type: str, result: dict) -> str:
    """Текст работы для Presenton — максимум из уже сгенерированного DOCX-контента."""
    structure = result.get("structure") or []
    is_long = work_type in ("Курсовая", "ВКР")
    max_sections = 12 if is_long else 8
    chars = 600 if is_long else 400

    parts = [
        f"Тема: {topic}",
        f"Тип работы: {work_type}",
        "",
        "Собери презентацию для защиты СТРОГО по этому тексту.",
        "Не добавляй факты, которых нет ниже. Язык: русский.",
        "",
    ]
    content = result.get("content") or {}
    for section in structure[:max_sections]:
        raw = content.get(section, "") or ""
        raw = re.sub(r"\[TABLE\].*?\[/TABLE\]", "", raw, flags=re.DOTALL)
        parts.append(f"## {section}\n{raw[:chars]}\n")

    intro = result.get("intro") or ""
    conclusion = result.get("conclusion") or ""
    if intro:
        parts.append(f"## Введение\n{intro[:chars]}\n")
    if conclusion:
        parts.append(f"## Заключение\n{conclusion[:chars]}\n")

    return "\n".join(parts).strip()


def generate_presentation(
    topic: str,
    work_type: str,
    result: dict,
    *,
    theme: str | None = None,
    template: str | None = None,
    n_slides: int | None = None,
) -> dict[str, Any]:
    """
    Создаёт презентацию через Presenton.
    Возвращает dict: presentation_id, path (pptx url), edit_path, raw.
    """
    content = build_content_from_result(topic, work_type, result)
    theme = theme or _env("PRESENTON_THEME", "professional-blue")
    template = template or _env("PRESENTON_TEMPLATE", "general")
    slides = n_slides or (11 if work_type in ("Курсовая", "ВКР") else 8)

    if _is_cloud():
        return _generate_cloud(content, topic, theme, template, slides)
    return _generate_selfhost(content, topic, theme, template, slides)


def _generate_selfhost(
    content: str,
    title: str,
    theme: str,
    template: str,
    n_slides: int,
) -> dict[str, Any]:
    url = f"{_base_url()}/api/v1/ppt/presentation/generate"
    payload = {
        "content": content,
        "instructions": (
            "Академическая презентация по защите курсовой. "
            "Только факты из текста. Плотный текст на слайдах."
        ),
        "tone": "educational",
        "verbosity": "text-heavy",
        "web_search": False,
        "n_slides": n_slides,
        "language": "Russian",
        "template": template,
        "theme": theme,
        "include_table_of_contents": True,
        "include_title_slide": True,
        "export_as": "pptx",
    }
    return _post_json(url, payload)


def _generate_cloud(
    content: str,
    title: str,
    theme: str,
    template: str,
    n_slides: int,
) -> dict[str, Any]:
    url = f"{_base_url()}/api/v3/presentation/generate"
    payload = {
        "content": content,
        "instructions": "Академическая презентация, только факты из текста, русский язык.",
        "tone": "educational",
        "verbosity": "text-heavy",
        "web_search": False,
        "n_slides": n_slides,
        "language": "Russian",
        "standard_template": template,
        "theme": theme,
        "include_table_of_contents": True,
        "include_title_slide": True,
        "export_as": "pptx",
        "title": title[:500],
    }
    return _post_json(url, payload)


def _post_json(url: str, payload: dict) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_auth_headers(), method="POST")
    timeout = int(_env("PRESENTON_TIMEOUT", "600"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"Presenton HTTP {e.code}: {err_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Presenton недоступен: {e}") from e

    out = json.loads(body)
    pid = out.get("presentation_id") or out.get("presentationId")
    path = out.get("path") or out.get("exportUrl")
    edit = out.get("edit_path") or out.get("editPath")
    if not path:
        raise RuntimeError(f"Presenton: нет path в ответе: {body[:500]}")
    return {
        "presentation_id": pid,
        "path": path,
        "edit_path": edit,
        "raw": out,
    }


def download_pptx_to_file(pptx_url: str, dest_path: str) -> None:
    """Скачивает PPTX по URL Presenton в локальный файл."""
    req = urllib.request.Request(pptx_url, headers=_auth_headers())
    timeout = int(_env("PRESENTON_DOWNLOAD_TIMEOUT", "120"))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    with open(dest_path, "wb") as f:
        f.write(data)
