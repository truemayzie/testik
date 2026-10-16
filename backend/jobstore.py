"""
jobstore.py — персистентность заданий генерации на диск.

Защита от потери данных при рестарте backend:
- снапшот _jobs дублируется в backend/data/jobs.json (атомарно: tmp + rename);
- при старте приложения running-задачи помечаются прерванными
  (фронтенд через reconciler честно завершит их как failed);
- checkpoints/ — частичные результаты генерации (источники, структура,
  готовые разделы). При повторном запросе той же работы (тот же topic +
  work_type + pages) генерация продолжается с места сбоя, а не с нуля.

Все функции молча переживают недоступность диска (OSError) —
в худшем случае система деградирует до прежнего in-memory поведения.
"""

import hashlib
import json
import os
import time

_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
_JOBS_FILE = os.path.join(_DATA_DIR, "jobs.json")
_CHECKPOINT_DIR = os.path.join(_DATA_DIR, "checkpoints")

# Checkpoint актуален 2 часа: дальше контекст модели "остывает",
# а пользователь скорее всего уже ушёл или повторил заказ.
CHECKPOINT_TTL_SEC = 2 * 60 * 60

INTERRUPTED_MESSAGE = "Генерация прервана: сервер был перезапущен. Повторите запрос — продолжим с места сбоя."


def checkpoint_key(topic: str, work_type: str, pages: int) -> str:
    """Стабильный ключ checkpoint по параметрам работы."""
    raw = f"{(topic or '').strip().lower()}|{(work_type or '').strip().lower()}|{int(pages or 0)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def save_jobs(jobs: dict) -> None:
    """Атомарно сохраняет снапшот _jobs. Вызывать только под _jobs_lock."""
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        tmp = _JOBS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False)
        os.replace(tmp, _JOBS_FILE)
    except OSError:
        pass


def load_and_mark_interrupted(jobs: dict) -> int:
    """
    Загружает jobs.json после рестарта:
    - done/error записи восстанавливаются как есть (фронт успеет забрать результат);
    - running помечаются error(INTERRUPTED_MESSAGE) — поток-генератор мёртв.
    Возвращает количество прерванных running-задач.
    """
    try:
        with open(_JOBS_FILE, "r", encoding="utf-8") as f:
            restored = json.load(f)
    except (OSError, json.JSONDecodeError):
        return 0
    if not isinstance(restored, dict):
        return 0

    interrupted = 0
    for job_id, job in restored.items():
        if not isinstance(job, dict):
            continue
        if job.get("status") == "running":
            job["status"] = "error"
            job["error"] = INTERRUPTED_MESSAGE
            job["result"] = None
            interrupted += 1
        jobs[job_id] = job

    if interrupted:
        save_jobs(jobs)
    return interrupted


# ── Checkpoints: частичные результаты генерации ─────────────────────────────

def save_checkpoint(key: str, state: dict) -> None:
    """Сохраняет промежуточное состояние генерации (после каждого этапа)."""
    try:
        os.makedirs(_CHECKPOINT_DIR, exist_ok=True)
        state = dict(state)
        state["saved_at"] = time.time()
        tmp = os.path.join(_CHECKPOINT_DIR, f"{key}.json.tmp")
        path = os.path.join(_CHECKPOINT_DIR, f"{key}.json")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError:
        pass


def load_checkpoint(key: str) -> dict | None:
    """Возвращает свежий checkpoint или None (просрочен/отсутствует/битый)."""
    path = os.path.join(_CHECKPOINT_DIR, f"{key}.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(state, dict):
        return None
    if time.time() - float(state.get("saved_at") or 0) > CHECKPOINT_TTL_SEC:
        return None
    return state


def clear_checkpoint(key: str) -> None:
    """Удаляет checkpoint после успешного завершения генерации."""
    try:
        os.remove(os.path.join(_CHECKPOINT_DIR, f"{key}.json"))
    except OSError:
        pass


# ── Кроссплатформенное хранилище временных файлов extras ───────────────────

_EXTRAS_DIR = os.getenv("EXTRAS_TMP_DIR", "").strip() or os.path.join(_DATA_DIR, "tmp")


def get_extras_dir() -> str:
    """Возвращает кроссплатформенный каталог для временных файлов extras."""
    try:
        os.makedirs(_EXTRAS_DIR, exist_ok=True)
    except OSError:
        pass
    return _EXTRAS_DIR


def extras_file_path(filename: str) -> str:
    """
    Кроссплатформенный путь к файлу extras:
    - по умолчанию пишется/читается в backend/data/tmp/ (Windows и Linux);
    - при чтении проверяет фолбэк на /tmp (если файл был создан старой версией).
    """
    primary = os.path.join(get_extras_dir(), filename)
    if os.path.exists(primary):
        return primary
    # Фолбэк на /tmp для обратной совместимости на Linux серверах
    try:
        legacy = os.path.join("/tmp", filename)
        if os.path.exists(legacy):
            return legacy
    except Exception:
        pass
    return primary
