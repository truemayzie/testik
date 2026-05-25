import io
import json
import os
import time
import subprocess
import threading
import uuid
from fastapi import FastAPI, HTTPException, Header, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict
from pptx import Presentation
from pptx.util import Emu
from generator import generate_work, generate_payment_preview
from oneoff_vkr_didactic_time import generate_oneoff_vkr, TOPIC as ONEOFF_VKR_TOPIC
from github_proxy import start_callback_server

start_callback_server()
from formatter import create_docx
from slots import MAX_SLOTS, compute_used_slots, list_available_work_types, slot_weight

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

# Ожидаемая длительность генерации (сек) для более стабильного ETA.
# Это оценка, но она гораздо лучше раннего ratio по шагам.
WORK_ETA_SECONDS: dict[str, int] = {
    "Сочинение": 180,
    "Эссе": 180,
    "Доклад": 480,
    "Реферат": 720,
    "Курсовая": 1200,
    "ВКР": 2400,
    "Тест": 20,
}


def _job_start_unlocked(job_id: str, work_type: str = "Реферат"):
    """Добавляет running-job; вызывать только под _jobs_lock."""
    now = time.time()
    expected_total = WORK_ETA_SECONDS.get(work_type, 180)
    _jobs[job_id] = {
        "status": "running",
        "result": None,
        "error": None,
        "work_type": work_type,
        "started_at": now,
        "expected_total_seconds": expected_total,
        "progress": {
            "step": 0,
            "total_steps": 0,
            "label": "Запуск задачи",
            "percent": 1,
            "eta_seconds": None,
        },
    }


def _job_progress(job_id: str, step: int, total_steps: int, label: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job or job.get("status") != "running":
            return
        started_at = float(job.get("started_at") or time.time())
        expected_total = int(job.get("expected_total_seconds") or 0)
        elapsed = max(1.0, time.time() - started_at)
        step_ratio = max(0.0, min(1.0, (step / total_steps) if total_steps > 0 else 0.0))
        # Адаптивная оценка общей длительности:
        # если фактический темп медленнее baseline, расширяем expected_total,
        # чтобы процент не упирался в 90-99% задолго до готовности.
        adaptive_total = expected_total
        if expected_total > 0 and step_ratio >= 0.08:
            pace_total = int(elapsed / step_ratio)
            adaptive_total = max(expected_total, int(pace_total * 1.12))
            if adaptive_total != expected_total:
                job["expected_total_seconds"] = adaptive_total

        time_ratio = max(0.0, min(1.0, (elapsed / adaptive_total) if adaptive_total > 0 else 0.0))

        # Гибрид: прогресс по этапам + фактическое время.
        # Так шкала не "застывает", но и не улетает в 90% слишком рано.
        if adaptive_total > 0:
            mixed_ratio = (step_ratio * 0.60) + (time_ratio * 0.40)
            # На ранних этапах ограничиваем "перелёт" по процентам относительно времени.
            if step_ratio < 0.95:
                mixed_ratio = min(mixed_ratio, time_ratio + 0.12)
            percent = max(1, min(99, int(round(mixed_ratio * 100))))
        else:
            percent = max(1, min(99, int(round(step_ratio * 100))))

        prev_percent = int((job.get("progress") or {}).get("percent") or 0)
        percent = max(prev_percent, percent)
        eta_seconds = None
        if adaptive_total > 0:
            eta_by_time = max(0, int(round(adaptive_total - elapsed)))
            if step_ratio > 0.03:
                total_est_by_step = elapsed / step_ratio
                eta_by_step = max(0, int(round(total_est_by_step - elapsed)))
                eta_seconds = int(round((eta_by_time * 0.65) + (eta_by_step * 0.35)))
            else:
                eta_seconds = eta_by_time
        elif step_ratio > 0:
            total_est = elapsed / step_ratio
            eta_seconds = max(0, int(round(total_est - elapsed)))
        job["progress"] = {
            "step": step,
            "total_steps": total_steps,
            "label": label,
            "percent": percent,
            "eta_seconds": eta_seconds,
        }


def _job_done(job_id: str, result: dict):
    with _jobs_lock:
        if job_id in _jobs:
            prev = _jobs[job_id]
            _jobs[job_id] = {
                "status": "done",
                "result": result,
                "error": None,
                "progress": {
                    "step": prev.get("progress", {}).get("total_steps", 0),
                    "total_steps": prev.get("progress", {}).get("total_steps", 0),
                    "label": "Готово",
                    "percent": 100,
                    "eta_seconds": 0,
                },
            }


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
        used = compute_used_slots(_jobs.values())
        available = list_available_work_types(used)
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
    needed = slot_weight(request.work_type)
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        used = compute_used_slots(_jobs.values())
        if used + needed > MAX_SLOTS:
            available = list_available_work_types(used)
            raise HTTPException(
                status_code=503,
                detail={"message": "Сервер перегружен", "available": available},
            )
        _job_start_unlocked(job_id, request.work_type)

    def run():
        try:
            result = generate_work(
                topic=request.topic,
                pages=request.pages,
                work_type=request.work_type,
                profile=request.profile,
                progress_cb=lambda s, t, label: _job_progress(job_id, s, t, label),
            )
            _job_done(job_id, result)
        except Exception as exc:
            print(f"[job {job_id}] Ошибка генерации: {exc}")
            _job_fail(job_id, str(exc))

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    return {"jobId": job_id}


class PreviewRequest(BaseModel):
    topic: str
    work_type: str = "Реферат"


def _verify_internal_api(
    request: Request,
    x_internal_token: str | None = Header(None, alias="X-Internal-Token"),
) -> None:
    """Превью только через Next.js — не напрямую с /api/ (FastAPI без авторизации)."""
    secret = os.getenv("INTERNAL_API_SECRET") or os.getenv("PROXY_SECRET")
    if secret:
        if x_internal_token != secret:
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    client = (request.client.host if request.client else "") or ""
    if client not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Forbidden")


class OneoffVkrRequest(BaseModel):
    pages: int = 55
    profile: dict | None = None


@app.post("/api/generate/oneoff-vkr-didactic-time", dependencies=[Depends(_verify_internal_api)])
def create_oneoff_vkr_didactic(req: OneoffVkrRequest):
    """
    Разовая генерация ВКР по фиксированному плану (дидактические игры + время).
    Не использует общий промпт структуры ВКР. Только localhost + internal token.
    """
    work_type = "ВКР"
    needed = slot_weight(work_type)
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        used = compute_used_slots(_jobs.values())
        if used + needed > MAX_SLOTS:
            available = list_available_work_types(used)
            raise HTTPException(
                status_code=503,
                detail={"message": "Сервер перегружен", "available": available},
            )
        _job_start_unlocked(job_id, work_type)

    def run():
        try:
            result = generate_oneoff_vkr(
                ONEOFF_VKR_TOPIC,
                req.pages,
                req.profile,
                progress_cb=lambda s, t, label: _job_progress(job_id, s, t, label),
            )
            _job_done(job_id, result)
        except Exception as exc:
            print(f"[oneoff job {job_id}] Ошибка: {exc}")
            _job_fail(job_id, str(exc))

    threading.Thread(target=run, daemon=True).start()
    return {"jobId": job_id, "topic": ONEOFF_VKR_TOPIC}


@app.post("/api/generate/preview", dependencies=[Depends(_verify_internal_api)])
def create_preview(req: PreviewRequest):
    """Дешёвый предпросмотр перед оплатой (без DOCX, один вызов LLM)."""
    try:
        return generate_payment_preview(req.topic, req.work_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        print(f"[preview] {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/generate/status/{job_id}")
def get_job_status(job_id: str):
    """Возвращает статус задания: running | done | error | not_found."""
    job = _job_get(job_id)
    if not job:
        return {"status": "not_found"}
    return {
        "status": job["status"],
        "error": job.get("error"),
        "progress": job.get("progress"),
    }


@app.get("/api/generate/result/{job_id}", response_model=ReferatResponse)
def get_job_result(job_id: str):
    """Возвращает результат без удаления (job удаляется через DELETE после сохранения в БД)."""
    job = _job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Задание ещё не завершено")
    result = job.get("result")
    if not result:
        raise HTTPException(status_code=500, detail="Результат пуст")
    return result


@app.delete("/api/generate/job/{job_id}")
def discard_job(job_id: str):
    """Удаляет задание из памяти после успешного сохранения результата в БД."""
    job = _job_pop(job_id)
    if not job:
        return {"ok": True, "removed": False}
    return {"ok": True, "removed": True}


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
