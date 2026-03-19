import threading
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from generator import generate_work
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
