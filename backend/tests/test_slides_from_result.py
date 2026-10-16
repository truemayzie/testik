import pytest
from slides_from_result import build_slides_from_result, _accent_for_work_type

def test_accent_colors():
    assert _accent_for_work_type("Курсовая") == "green"
    assert _accent_for_work_type("ВКР") == "green"
    assert _accent_for_work_type("Эссе") == "bordeaux"
    assert _accent_for_work_type("Сочинение") == "bordeaux"
    assert _accent_for_work_type("Реферат") == "blue"

def test_build_slides_structure():
    result_mock = {
        "title": "Тема исследования",
        "structure": ["Введение", "1. Основная часть", "Заключение"],
        "content": {
            "Введение": "Текст введения для исследования с описанием актуальности темы.",
            "1. Основная часть": "Первый абзац основной части с подробным анализом.\n\nВторой абзац с выводами.",
            "Заключение": "Итоговые результаты и заключение по теме.",
        },
        "sources": ["Источник 1", "Источник 2"],
    }

    slides_data = build_slides_from_result("Тема исследования", "Реферат", result_mock)
    assert "accent" in slides_data
    assert slides_data["accent"] == "blue"
    slides = slides_data.get("slides", [])
    assert len(slides) >= 3

    # First slide should be title
    title_slide = slides[0]
    assert title_slide["type"] == "TITLE"
    assert title_slide["title"] == "Тема исследования"

    # Middle slides should contain content
    slide_types = [s["type"] for s in slides]
    assert "CONTENT" in slide_types or "TOC" in slide_types
