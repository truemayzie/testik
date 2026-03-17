from fastapi import FastAPI
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


@app.get("/")
def root():
    return {"status": "ok", "service": "Academic Service"}


@app.post("/api/generate/referat", response_model=ReferatResponse)
def create_referat(request: ReferatRequest):
    """Генерирует реферат и возвращает JSON."""
    result = generate_work(topic=request.topic, pages=request.pages, work_type=request.work_type, profile=request.profile)
    return result


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
