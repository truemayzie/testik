import os
import threading
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from generator import generate_work
from github_proxy import start_callback_server

start_callback_server()
from formatter import create_docx

app = FastAPI(title="Academic Service API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── In-memory хранилище заданий ──────────────────────────────────────────────
# Каждая запись: {"status": "running"|"done"|"error", "result": dict|None, "error": str|None}
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()

MAX_CONCURRENT_JOBS = 8


def _job_start(job_id: str):
    with _jobs_lock:
        _jobs[job_id] = {"status": "running", "result": None, "error": None}


def _job_done(job_id: str, result: dict):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id] = {"status": "done", "result": result, "error": None}


def _job_fail(job_id: str, error: str):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id] = {"status": "error", "result": None, "error": error}


def _job_pop(job_id: str) -> dict | None:
    with _jobs_lock:
        return _jobs.pop(job_id, None)


def _job_get(job_id: str) -> dict | None:
    with _jobs_lock:
        return _jobs.get(job_id)


# ── Модели ───────────────────────────────────────────────────────────────────

class ReferatRequest(BaseModel):
    topic: str
    pages: int = 20
    work_type: str = "Реферат"
    profile: dict | None = None


class ReferatResponse(BaseModel):
    title: str
    structure: list[str]
    content: dict[str, str]
    sources: list[str]
    meta: dict
    profile: dict | None = None


# ── Эндпоинты ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Academic Service"}


@app.post("/api/generate/referat")
def create_referat(request: ReferatRequest):
    """
    Запускает генерацию в фоновом потоке и сразу возвращает jobId.
    Next.js опрашивает /api/generate/status/{jobId} каждые 5 секунд.
    """
    with _jobs_lock:
        running = sum(1 for j in _jobs.values() if j["status"] == "running")
        if running >= MAX_CONCURRENT_JOBS:
            raise HTTPException(
                status_code=503,
                detail="Сервер перегружен, попробуйте через минуту"
            )

    job_id = str(uuid.uuid4())
    _job_start(job_id)

    def run():
        try:
            result = generate_work(
                topic=request.topic,
                pages=request.pages,
                work_type=request.work_type,
                profile=request.profile,
            )
            _job_done(job_id, result)
        except Exception as exc:
            print(f"[job {job_id}] Ошибка генерации: {exc}")
            _job_fail(job_id, str(exc))

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    return {"jobId": job_id}


@app.get("/api/generate/status/{job_id}")
def get_job_status(job_id: str):
    """Возвращает статус задания: running | done | error | not_found."""
    job = _job_get(job_id)
    if not job:
        return {"status": "not_found"}
    return {"status": job["status"], "error": job.get("error")}


@app.get("/api/generate/result/{job_id}", response_model=ReferatResponse)
def get_job_result(job_id: str):
    """Возвращает результат и удаляет задание из памяти."""
    job = _job_pop(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Задание ещё не завершено")
    return job["result"]


@app.post("/api/download/referat")
def download_referat(request: ReferatResponse):
    """Принимает готовый реферат и возвращает DOCX файл."""
    docx_bytes = create_docx(request.model_dump())

    # Кириллица не работает в latin-1 заголовках — используем RFC 5987
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=referat.docx"}
    )


# ── Extras: генерация презентации и текста выступления ───────────────────────

_extras_jobs: dict[str, dict] = {}
_extras_lock = threading.Lock()


class ExtrasRequest(BaseModel):
    topic: str
    work_type: str
    items: list[str]          # ["presentation", "speech"]
    result: dict
    profile: dict | None = None


@app.post("/api/generate/extras")
def create_extras(request: ExtrasRequest):
    """Запускает генерацию доп. материалов в фоновом потоке."""
    extras_job_id = str(uuid.uuid4())
    with _extras_lock:
        _extras_jobs[extras_job_id] = {"status": "running", "ready": [], "error": None}

    def run():
        ready = []
        try:
            from presentation_generator import generate_presentation, generate_speech
            if "presentation" in request.items:
                generate_presentation(
                    extras_job_id,
                    request.topic,
                    request.work_type,
                    request.profile or {},
                    request.result,
                )
                ready.append("presentation")
            if "speech" in request.items:
                generate_speech(
                    extras_job_id,
                    request.topic,
                    request.work_type,
                    request.result,
                )
                ready.append("speech")
            with _extras_lock:
                _extras_jobs[extras_job_id] = {"status": "done", "ready": ready, "error": None}
            print(f"[extras {extras_job_id}] Готово: {ready}")
        except Exception as exc:
            print(f"[extras {extras_job_id}] Ошибка: {exc}")
            with _extras_lock:
                _extras_jobs[extras_job_id] = {"status": "error", "ready": ready, "error": str(exc)}

    threading.Thread(target=run, daemon=True).start()
    return {"extrasJobId": extras_job_id}


@app.get("/api/generate/extras/status/{extras_job_id}")
def get_extras_status(extras_job_id: str):
    """Возвращает статус генерации доп. материалов."""
    with _extras_lock:
        job = _extras_jobs.get(extras_job_id)
    if not job:
        return {"status": "not_found", "ready": []}
    return {"status": job["status"], "ready": job.get("ready", []), "error": job.get("error")}


@app.get("/api/download/presentation/{job_id}")
def download_presentation(job_id: str):
    """Возвращает PPTX-файл презентации."""
    path = f"/tmp/pptx_{job_id}.pptx"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    with open(path, "rb") as f:
        content = f.read()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": "attachment; filename=presentation.pptx"},
    )


@app.get("/api/download/speech/{job_id}")
def download_speech(job_id: str):
    """Возвращает DOCX-файл текста выступления."""
    path = f"/tmp/speech_{job_id}.docx"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    with open(path, "rb") as f:
        content = f.read()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=speech.docx"},
    )
