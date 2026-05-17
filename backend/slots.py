"""
Лимит параллельных генераций по «слотам» (вес типа работы).
Используется main.py; чистые функции удобно покрывать тестами без запуска FastAPI/Claude.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

DEFAULT_SLOT_WEIGHT = 2

WORK_SLOTS: dict[str, int] = {
    "Сочинение": 1,
    "Эссе": 1,
    "Доклад": 2,
    "Реферат": 2,
    "Курсовая": 4,
    "ВКР": 5,
    "Тест": 1,
}
MAX_SLOTS = 8  # например 2× Курсовая = 8


def compute_used_slots(jobs: Iterable[Mapping[str, Any]]) -> int:
    """Сумма весов всех заданий со статусом running."""
    return sum(
        WORK_SLOTS.get(j.get("work_type", "Реферат"), DEFAULT_SLOT_WEIGHT)
        for j in jobs
        if j.get("status") == "running"
    )


def list_available_work_types(used: int) -> list[str]:
    """Типы работ, которые можно запустить при текущей занятости слотов (без «Тест»)."""
    return [
        wt
        for wt, slots in WORK_SLOTS.items()
        if wt != "Тест" and used + slots <= MAX_SLOTS
    ]


def slot_weight(work_type: str) -> int:
    return WORK_SLOTS.get(work_type, DEFAULT_SLOT_WEIGHT)
