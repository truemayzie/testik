#!/usr/bin/env python3
"""Пробная сборка презентации из ion.pptx + JSON слайдов."""

import json
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from pptx_template_builder import build_pptx_file, template_available, template_path
from slides_from_result import build_slides_from_result

SAMPLE_RESULT = {
    "title": "Споры грибов как вирус",
    "structure": [
        "Введение",
        "1. Биологическая природа грибных спор и вирусов",
        "1.1. Структурные особенности спор грибов",
        "1.2. Определение и характеристики вирусов",
        "2. Сравнительный анализ спор грибов и вирусов",
        "Заключение",
        "Список литературы",
    ],
    "content": {
        "1. Биологическая природа грибных спор и вирусов": (
            "Грибные споры представляют собой репродуктивные структуры микроскопического размера. "
            "Они обеспечивают распространение грибов в окружающей среде. "
            "Вирусы — неклеточные формы жизни, нуждающиеся в хозяине для репликации."
        ),
        "1.1. Структурные особенности спор грибов": (
            "Споры имеют плотную оболочку и минимальный цитоплазматический объём. "
            "Размер обычно составляет от 2 до 10 мкм."
        ),
        "1.2. Определение и характеристики вирусов": (
            "Вирусы содержат генетический материал в белковой капсиде. "
            "Не способны к самостоятельному метаболизму."
        ),
        "2. Сравнительный анализ спор грибов и вирусов": (
            "Оба типа частиц участвуют в распространении в среде, но механизмы размножения принципиально различны."
        ),
    },
    "conclusion": "Грибные споры и вирусы схожи лишь в функции распространения, но различаются по организации и жизненному циклу.",
    "sources": ["1. Источник пример."],
}

PROFILE = {
    "university": "МГУ",
    "faculty": "Биологический",
    "fullName": "Иванов И.И.",
    "groupNumber": "101",
    "teacherName": "Петров П.П.",
    "city": "Москва",
}


def main() -> None:
    if not template_available():
        print("Шаблон не найден:", template_path())
        sys.exit(1)

    topic = "Споры грибов как вирус"
    slides_dict = build_slides_from_result(topic, "Доклад", SAMPLE_RESULT, PROFILE)
    out = os.path.join(BACKEND, "tamplates", "ion-test-output.pptx")
    build_pptx_file(slides_dict, out)
    print("OK:", out)
    print("Slides:", len(slides_dict.get("slides") or []))
    print(json.dumps([s.get("type") for s in slides_dict["slides"]], ensure_ascii=False))


if __name__ == "__main__":
    main()
