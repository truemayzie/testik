"""
applog.py — центральное логирование backend (файл + консоль).

Заменяет голые print(): всё пишется в backend/logs/generation.log
с ротацией (5 файлов по 10MB). Файл в UTF-8 — кириллица и спецсимволы
не зависят от кодировки консоли Windows (cp1251/cp850).

Дополнительно: stdout/stderr переводятся в режим errors="replace",
чтобы один нестандартный символ не мог уронить поток генерации
(раньше символ "✓" в cp1251 вызывал UnicodeEncodeError).
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

_LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
_LOG_FILE = os.path.join(_LOG_DIR, "generation.log")

_logger: logging.Logger | None = None


def _make_console_safe() -> None:
    """Консоль не должна падать на непечатаемых символах."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
        except Exception:
            pass


def get_logger() -> logging.Logger:
    """Логгер 'refai'. Инициализируется один раз (logging сам потокобезопасен)."""
    global _logger
    if _logger is not None:
        return _logger

    _make_console_safe()

    logger = logging.getLogger("refai")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        try:
            os.makedirs(_LOG_DIR, exist_ok=True)
            file_handler = RotatingFileHandler(
                _LOG_FILE,
                maxBytes=10 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setFormatter(
                logging.Formatter(
                    "%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S",
                )
            )
            logger.addHandler(file_handler)
        except OSError:
            # Нет прав на диск — работаем хотя бы с консолью.
            pass

        console = logging.StreamHandler()
        console.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
        logger.addHandler(console)

    logger.propagate = False
    _logger = logger
    return logger
