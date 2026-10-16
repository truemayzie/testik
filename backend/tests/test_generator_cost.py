from __future__ import annotations

import threading
from generator import (
    _session_cost_var,
    add_session_cost,
    get_session_cost,
    reset_session_cost,
)


def test_session_cost_initial_zero():
    reset_session_cost()
    assert get_session_cost() == 0.0


def test_session_cost_accumulation():
    reset_session_cost()
    add_session_cost(0.015)
    add_session_cost(0.025)
    assert round(get_session_cost(), 4) == 0.04


def test_session_cost_thread_isolation():
    """Проверяет, что параллельные потоки не затирают расходы друг друга."""
    reset_session_cost()
    results = {}

    def worker_a():
        reset_session_cost()
        add_session_cost(0.50)
        results["a"] = get_session_cost()

    def worker_b():
        reset_session_cost()
        add_session_cost(1.25)
        results["b"] = get_session_cost()

    t1 = threading.Thread(target=worker_a)
    t2 = threading.Thread(target=worker_b)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert results["a"] == 0.50
    assert results["b"] == 1.25
    assert get_session_cost() == 0.0
