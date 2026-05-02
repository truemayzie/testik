import io
import json
import os
import time
import subprocess
import threading
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict
from pptx import Presentation
from pptx.util import Emu
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
# Каждая запись: {"status": "running"|"done"|"error", "result": dict|None, "error": str|None, "work_type": str}
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()

# Вес каждого типа работы в слотах (отражает нагрузку на RAM и Claude API)
WORK_SLOTS: dict[str, int] = {
    "Сочинение": 1,
    "Эссе":      1,
    "Доклад":    2,
    "Реферат":   2,
    "Курсовая":  4,
    "ВКР":       5,
    "Тест":      1,
}
MAX_SLOTS = 8  # суммарный лимит слотов (2 Курсовых = 8, 1 ВКР + 1 Реферат = 7, итд)


def _used_slots() -> int:
    """Считает занятые слоты по всем активным заданиям."""
    return sum(
        WORK_SLOTS.get(j.get("work_type", "Реферат"), 2)
        for j in _jobs.values()
        if j["status"] == "running"
    )


def _available_types() -> list[str]:
    """Возвращает типы работ, которые можно запустить прямо сейчас."""
    used = _used_slots()
    return [wt for wt, slots in WORK_SLOTS.items()
            if wt != "Тест" and used + slots <= MAX_SLOTS]


def _job_start(job_id: str, work_type: str = "Реферат"):
    with _jobs_lock:
        _jobs[job_id] = {"status": "running", "result": None, "error": None, "work_type": work_type}


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
    """Результат генерации. extra='allow' — чтобы в JSON уходили служебные поля (`_cost_usd` и др.) для TG/аналитики."""
    model_config = ConfigDict(extra="allow")

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


@app.get("/api/slots")
def get_slots():
    """Возвращает доступные типы работ и занятость слотов."""
    with _jobs_lock:
        used = _used_slots()
        available = _available_types()
    return {
        "used": used,
        "max": MAX_SLOTS,
        "available": available,
    }


@app.post("/api/generate/referat")
def create_referat(request: ReferatRequest):
    """
    Запускает генерацию в фоновом потоке и сразу возвращает jobId.
    Next.js опрашивает /api/generate/status/{jobId} каждые 5 секунд.
    """
    needed = WORK_SLOTS.get(request.work_type, 2)
    with _jobs_lock:
        used = _used_slots()
        if used + needed > MAX_SLOTS:
            available = _available_types()
            raise HTTPException(
                status_code=503,
                detail={"message": "Сервер перегружен", "available": available},
            )

    job_id = str(uuid.uuid4())
    _job_start(job_id, request.work_type)

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
EXTRAS_FILE_TTL_SEC = 24 * 60 * 60  # 24 часа


class ExtrasRequest(BaseModel):
    topic: str
    work_type: str
    items: list[str]          # ["presentation", "speech"]
    result: dict
    profile: dict | None = None


def _cleanup_old_extras_files() -> None:
    """Удаляет старые файлы extras из /tmp, чтобы не накапливать мусор."""
    now = time.time()
    for prefix, ext in (
        ("pptx_", ".pptx"),
        ("speech_", ".docx"),
        ("pptx_slides_", ".json"),
    ):
        try:
            for name in os.listdir("/tmp"):
                if not (name.startswith(prefix) and name.endswith(ext)):
                    continue
                path = os.path.join("/tmp", name)
                try:
                    if not os.path.isfile(path):
                        continue
                    if now - os.path.getmtime(path) > EXTRAS_FILE_TTL_SEC:
                        os.remove(path)
                except Exception:
                    continue
        except Exception:
            continue


@app.post("/api/generate/extras")
def create_extras(request: ExtrasRequest):
    """Запускает генерацию доп. материалов в фоновом потоке."""
    _cleanup_old_extras_files()
    extras_job_id = str(uuid.uuid4())
    with _extras_lock:
        _extras_jobs[extras_job_id] = {"status": "running", "ready": [], "error": None}

    def run():
        ready = []
        slide_titles = None  # заголовки слайдов для синхронизации с текстом выступления
        try:
            from presentation_generator import generate_presentation, generate_speech
            if "presentation" in request.items:
                slides_dict, slide_titles = generate_presentation(
                    extras_job_id,
                    request.topic,
                    request.work_type,
                    request.profile or {},
                    request.result,
                )
                with _extras_lock:
                    _extras_jobs[extras_job_id]["slides"] = slides_dict
                try:
                    slides_path = f"/tmp/pptx_slides_{extras_job_id}.json"
                    with open(slides_path, "w", encoding="utf-8") as sf:
                        json.dump(slides_dict, sf, ensure_ascii=False)
                except Exception as exc:
                    print(f"[extras] backup slides JSON: {exc}")
                ready.append("presentation")
                try:
                    s_list = slides_dict.get("slides") or []
                    if s_list:
                        pptx_io = _render_to_pptx(s_list, slides_dict.get("accent") or "blue", {})
                        path_cache = f"/tmp/pptx_{extras_job_id}.pptx"
                        with open(path_cache, "wb") as f:
                            f.write(pptx_io.getvalue())
                        print(f"[extras] готовый PPTX: {path_cache}")
                except HTTPException as he:
                    print(f"[extras] не удалось сохранить PPTX в /tmp: {he.detail}")
                except Exception as exc:
                    print(f"[extras] не удалось сохранить PPTX в /tmp: {exc}")
            if "speech" in request.items:
                generate_speech(
                    extras_job_id,
                    request.topic,
                    request.work_type,
                    request.result,
                    slide_titles,
                )
                ready.append("speech")
            with _extras_lock:
                _extras_jobs[extras_job_id].update({"status": "done", "ready": ready, "error": None})
            print(f"[extras {extras_job_id}] Готово: {ready}")
        except Exception as exc:
            print(f"[extras {extras_job_id}] Ошибка: {exc}")
            with _extras_lock:
                _extras_jobs[extras_job_id].update({"status": "error", "ready": ready, "error": str(exc)})

    threading.Thread(target=run, daemon=True).start()
    return {"extrasJobId": extras_job_id}


@app.get("/api/generate/extras/status/{extras_job_id}")
def get_extras_status(extras_job_id: str):
    """Возвращает статус генерации доп. материалов."""
    with _extras_lock:
        job = _extras_jobs.get(extras_job_id)
    if not job:
        return {"status": "not_found", "ready": []}
    return {
        "status": job["status"],
        "ready":  job.get("ready", []),
        "error":  job.get("error"),
        "slides": job.get("slides"),   # JSON слайдов после генерации презентации
    }


@app.get("/api/extras/presentation-json/{job_id}")
def extras_presentation_json(job_id: str):
    """Резервная копия JSON слайдов (предпросмотр/БД), рядом с pptx в /tmp."""
    _cleanup_old_extras_files()
    path = f"/tmp/pptx_slides_{job_id}.json"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="JSON слайдов не найден")
    with open(path, "rb") as f:
        return Response(content=f.read(), media_type="application/json")


@app.get("/api/download/presentation/{job_id}")
def download_presentation(job_id: str):
    """Возвращает PPTX-файл презентации."""
    _cleanup_old_extras_files()
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
    _cleanup_old_extras_files()
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


# ── Генерация PPTX: HTML-слайды → Puppeteer PNG → сборка как у предпросмотра ─

class PresentationDownloadRequest(BaseModel):
    slides: list
    accent: str = "blue"
    images: dict = {}  # { "0": "data:image/...;base64,...", ... }


BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_RENDER_SCRIPT = os.path.join(BACKEND_DIR, "render_slides.js")


def _render_to_pptx(slides: list, accent: str, images: dict) -> io.BytesIO:
    """Визуал как вкладке «Презентация» в браузере: render_slides.js + python-pptx."""
    import base64

    if not slides:
        raise HTTPException(status_code=400, detail="Пустой список слайдов")

    accent_s = accent or "blue"
    imgs = images if isinstance(images, dict) else {}

    payload = json.dumps({"accent": accent_s, "slides": slides, "images": imgs}, ensure_ascii=False).encode("utf-8")
    try:
        proc = subprocess.run(
            ["node", _RENDER_SCRIPT],
            input=payload,
            capture_output=True,
            timeout=300,
            cwd=BACKEND_DIR,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Таймаут рендеринга слайдов")

    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace")[:2500]
        out_h = (proc.stdout or b"").decode("utf-8", errors="replace")[:500]
        print(f"[pptx] render_slides.js rc={proc.returncode} stderr={err!r} stdout_head={out_h!r}")
        raise HTTPException(status_code=500, detail="Ошибка рендеринга слайдов (Puppeteer)")

    try:
        png_list = json.loads(proc.stdout.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка парсинга PNG: {exc}")

    prs = Presentation()
    prs.slide_width = Emu(9144000)
    prs.slide_height = Emu(5143500)
    blank_layout = prs.slide_layouts[6]

    for b64 in png_list:
        slide_p = prs.slides.add_slide(blank_layout)
        img_stream = io.BytesIO(base64.b64decode(b64))
        slide_p.shapes.add_picture(img_stream, left=0, top=0, width=prs.slide_width, height=prs.slide_height)
    out = io.BytesIO()
    prs.save(out)
    out.seek(0)
    return out


@app.post("/api/presentation/download")
def presentation_download(request: PresentationDownloadRequest):
    """Собирает PPTX через HTML-рендер (как во фронтовом предпросмотре)."""
    pptx_io = _render_to_pptx(request.slides, request.accent, request.images)
    return StreamingResponse(
        pptx_io,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": "attachment; filename=presentation.pptx"},
    )


@app.post("/api/presentation/rebuild")
def presentation_rebuild(request: PresentationDownloadRequest):
    """Пересборка PPTX через HTML → PNG."""
    pptx_io = _render_to_pptx(request.slides, request.accent, request.images)

    return StreamingResponse(
        pptx_io,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": "attachment; filename=presentation.pptx"},
    )
