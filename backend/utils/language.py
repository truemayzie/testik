"""
language.py — мультиязычные метки и авто-определение языка темы (ru | kz | en).
"""

from __future__ import annotations
import re

LANG_LABELS = {
    "ru": {
        "name": "русский",
        "intro": "Введение",
        "conclusion": "Заключение",
        "sources": "Список литературы",
    },
    "kz": {
        "name": "казахский",
        "intro": "Кіріспе",
        "conclusion": "Қорытынды",
        "sources": "Пайдаланылған әдебиеттер",
    },
    "en": {
        "name": "English",
        "intro": "Introduction",
        "conclusion": "Conclusion",
        "sources": "References",
    },
}


def detect_language_from_topic(topic: str) -> str:
    """Auto-script определение языка темы: kz | en | ru (fallback)."""
    text = (topic or "").strip()
    if not text:
        return "ru"
    low = text.lower()
    if any(tag in low for tag in ("[kz]", "kz:", "қаз", "каз")):
        return "kz"
    if any(tag in low for tag in ("[en]", "en:", "english", "англ")):
        return "en"
    if re.search(r"[әіңғүұқөһ]", low):
        return "kz"
    letters = re.findall(r"[A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]", text)
    if not letters:
        return "ru"
    latin = sum(ch.isascii() and ch.isalpha() for ch in letters)
    cyril = len(letters) - latin
    if latin > cyril:
        return "en"
    return "ru"


def get_lang_labels(doc_lang: str) -> dict[str, str]:
    return LANG_LABELS.get(doc_lang, LANG_LABELS["ru"])


def canonical_service_key(name: str) -> str:
    s = (name or "").strip().lower()
    variants = {
        "intro": {"введение", "кіріспе", "introduction"},
        "conclusion": {"заключение", "қорытынды", "conclusion"},
        "sources": {"список литературы", "пайдаланылған әдебиеттер", "references"},
        "appendix": {"приложения", "қосымшалар", "appendix", "appendices"},
    }
    for key, names in variants.items():
        if s in names:
            return key
    return ""
