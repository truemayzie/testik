import pytest
from utils.language import detect_language_from_topic, canonical_service_key, get_lang_labels
from prompts.rules import WORK_RULES, SERVICE_PAGES
from prompts.structure import get_structure_prompt
from prompts.sections import get_intro_prompt, get_section_prompt, get_conclusion_prompt

def test_detect_language():
    assert detect_language_from_topic("История развития искусственного интеллекта") == "ru"
    assert detect_language_from_topic("Modern approaches to microservices architecture") == "en"
    assert detect_language_from_topic("12345 6789") == "ru"  # Default fallback

def test_canonical_service_key():
    assert canonical_service_key("введение") == "intro"
    assert canonical_service_key("заключение") == "conclusion"
    assert canonical_service_key("список литературы") == "sources"
    assert canonical_service_key("приложения") == "appendix"
    assert canonical_service_key("random header") == ""

def test_lang_labels():
    ru = get_lang_labels("ru")
    assert ru["intro"] == "Введение"
    en = get_lang_labels("en")
    assert en["intro"] == "Introduction"

def test_prompts_generation():
    rules = WORK_RULES["Курсовая"]
    struct_p = get_structure_prompt("Тема исследования", "Курсовая", rules, "ru")
    assert "Тема исследования" in struct_p
    assert "JSON" in struct_p

    intro_p = get_intro_prompt("Тема исследования", "Курсовая", 300, "", "ru")
    assert "300 слов" in intro_p

    sec_p = get_section_prompt("Тема исследования", "1.1. Название", "Глава 1", 500, "Курсовая", "", "ru")
    assert "1.1. Название" in sec_p

    concl_p = get_conclusion_prompt("Тема исследования", "Курсовая", 300, "ru")
    assert "300 слов" in concl_p

def test_rebuild_preview_toc_essay():
    from generator import _rebuild_preview_toc_essay
    ai_rows = [
        {"num": "1", "title": "1. Мой друг дядя Дима"},
        {"num": "1.1", "title": "1.1. Характер и внешность"},
        {"num": "1.2", "title": "1.2. Чему он меня научил"},
    ]
    res = _rebuild_preview_toc_essay(ai_rows, "Введение", "Заключение", "ru")
    assert len(res) == 3
    for row in res:
        assert row["num"] == "", f"Expected empty num for essay, got {row['num']}"
        assert not row["title"].startswith("1."), f"Expected stripped title, got {row['title']}"
        assert not row["title"].startswith("1"), f"Expected stripped title, got {row['title']}"
    assert res[0]["title"] == "Мой друг дядя Дима"
    assert res[1]["title"] == "Характер и внешность"
    assert res[2]["title"] == "Чему он меня научил"
