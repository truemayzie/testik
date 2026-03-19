import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from formatter import create_docx

WORK_TYPES = ["Реферат", "Доклад", "Курсовая", "ВКР"]

# Аргумент командной строки: python test_title.py Реферат
# Без аргумента — генерирует все типы сразу
targets = []
if len(sys.argv) > 1:
    wt = sys.argv[1]
    if wt not in WORK_TYPES:
        print(f"Неизвестный тип. Доступные: {', '.join(WORK_TYPES)}")
        sys.exit(1)
    targets = [wt]
else:
    targets = WORK_TYPES

PROFILE = {
    "university": "Московский государственный университет имени М.В. Ломоносова",
    "faculty": "Факультет психологии",
    "department": "Общей психологии",
    "direction": "37.03.01 Психология",
    "discipline": "Экология",
    "full_name": "Смирнова Анна Сергеевна",
    "course": "3",
    "group": "ПС-301",
    "city": "Москва",
    "teacher": "Петров Дмитрий Александрович",
}

os.makedirs("test_output", exist_ok=True)

for work_type in targets:
    test_data = {
        "title": f"{work_type} на тему: «Тестовая тема для проверки титульника»",
        "structure": ["Введение", "Заключение"],
        "content": {
            "Введение": "Тестовый текст введения.",
            "Заключение": "Тестовый текст заключения.",
        },
        "sources": ["1. Тестовый источник. — М.: Издательство, 2024. — 100 с."],
        "meta": {
            "Тип работы": work_type,
            "ГОСТ": "7.32-2017",
            "Шрифт": "Times New Roman, 14pt",
            "Интервал": "1.5",
            "Поля": "Л 30мм / П 10мм / В 20мм / Н 20мм",
            "Объём": "~20 страниц",
            "Разделов": "2",
            "Источников": "1",
        },
        "profile": PROFILE,
    }

    docx_bytes = create_docx(test_data)
    out = f"test_output/title_{work_type.lower().replace(' ', '_')}.docx"
    with open(out, "wb") as f:
        f.write(docx_bytes)
    print(f"[{work_type}] -> {out}")
