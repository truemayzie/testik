"""
Юнит-тесты лимита слотов без FastAPI, Claude и генерации.

Запуск из каталога backend:
  pip install -r requirements-dev.txt
  python -m pytest tests/test_slots.py -v
"""

from __future__ import annotations

import threading
import uuid

from slots import (
    MAX_SLOTS,
    WORK_SLOTS,
    compute_used_slots,
    list_available_work_types,
    slot_weight,
)


def test_compute_used_slots_empty():
    assert compute_used_slots([]) == 0


def test_only_running_counted():
    jobs = [
        {"status": "running", "work_type": "Реферат"},
        {"status": "done", "work_type": "Курсовая"},
        {"status": "error", "work_type": "ВКР"},
    ]
    assert compute_used_slots(jobs) == WORK_SLOTS["Реферат"]


def test_unknown_work_type_defaults_weight():
    jobs = [{"status": "running", "work_type": "НесуществующийТип"}]
    assert compute_used_slots(jobs) == 2


def test_missing_work_type_falls_back_to_referat_weight():
    jobs = [{"status": "running"}]
    assert compute_used_slots(jobs) == WORK_SLOTS["Реферат"]


def test_list_available_when_slots_free():
    avail = list_available_work_types(0)
    assert "Курсовая" in avail and "ВКР" in avail
    assert "Тест" not in avail


def test_list_available_when_full():
    avail = list_available_work_types(MAX_SLOTS)
    assert avail == []


def test_vkr_plus_referat_fits_one_slot_left():
    """5 + 2 = 7 — остаётся 1 слот: только Сочинение/Эссе."""
    used = WORK_SLOTS["ВКР"] + WORK_SLOTS["Реферат"]
    assert used == 7
    avail = list_available_work_types(used)
    assert avail == ["Сочинение", "Эссе"]


def test_two_kursovaya_uses_all_slots():
    used = 2 * WORK_SLOTS["Курсовая"]
    assert used == MAX_SLOTS
    assert list_available_work_types(used) == []


def _try_reserve(
    jobs: dict,
    lock: threading.Lock,
    work_type: str,
) -> bool:
    """Та же атомарная логика, что в create_referat после рефакторинга."""
    jid = str(uuid.uuid4())
    with lock:
        used = compute_used_slots(jobs.values())
        needed = slot_weight(work_type)
        if used + needed > MAX_SLOTS:
            return False
        jobs[jid] = {"status": "running", "work_type": work_type}
        return True


def test_concurrent_kursovaya_at_most_two_starts():
    """48 параллельных попыток стартовать курсовую: не более 2 успехов (2×4=8 слотов)."""
    jobs: dict = {}
    lock = threading.Lock()
    results: list[bool] = []

    def attempt():
        results.append(_try_reserve(jobs, lock, "Курсовая"))

    threads = [threading.Thread(target=attempt) for _ in range(48)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(results) == 2
    assert compute_used_slots(jobs.values()) == MAX_SLOTS
    assert len(jobs) == 2


def test_consumed_slots_never_exceeds_max_under_mixed_race():
    """Смешанные типы + много потоков: инвариант used <= MAX_SLOTS после каждого успешного reserve."""
    jobs: dict = {}
    lock = threading.Lock()
    types = ["Сочинение", "Реферат", "Курсовая", "Эссе", "Доклад"]

    def chaos():
        for _ in range(30):
            wt = types[uuid.uuid4().int % len(types)]
            _try_reserve(jobs, lock, wt)

    threads = [threading.Thread(target=chaos) for _ in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert compute_used_slots(jobs.values()) <= MAX_SLOTS
