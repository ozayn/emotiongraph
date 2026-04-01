from datetime import date

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, engine, get_db
from app.models import LogEntry
from app.schemas import ExtractLogsRequest, ExtractLogsResponse, LogEntryRead, SaveLogsRequest
from app.services.extraction import extract_logs_from_transcript
from app.services.transcription import is_transcript_usable, transcribe_audio_bytes

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Emotiongraph API")

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")
    try:
        raw = await audio.read()
        if not raw:
            raise HTTPException(status_code=400, detail="empty upload")
        text = transcribe_audio_bytes(audio.filename or "recording.webm", raw)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    if not is_transcript_usable(text):
        raise HTTPException(
            status_code=422,
            detail="Transcript contains no usable speech",
        )
    return {"transcript": text}


@app.post("/extract-logs", response_model=ExtractLogsResponse)
def extract_logs(body: ExtractLogsRequest):
    if not settings.openai_api_key and not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY or GROQ_API_KEY is not configured (extraction)",
        )
    try:
        return extract_logs_from_transcript(body.transcript, body.log_date.isoformat())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"invalid model JSON: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/logs", response_model=list[LogEntryRead])
def list_logs(log_date: date, db: Session = Depends(get_db)):
    rows = (
        db.query(LogEntry)
        .filter(LogEntry.log_date == log_date)
        .order_by(LogEntry.id.asc())
        .all()
    )
    return rows


@app.post("/logs", response_model=list[LogEntryRead])
def save_logs(body: SaveLogsRequest, db: Session = Depends(get_db)):
    created: list[LogEntry] = []
    for r in body.rows:
        entry = LogEntry(
            log_date=body.log_date,
            start_time=r.start_time,
            end_time=r.end_time,
            event=r.event,
            event_category=r.event_category,
            energy_level=r.energy_level,
            anxiety=r.anxiety,
            contentment=r.contentment,
            focus=r.focus,
            music=r.music,
            comments=r.comments,
        )
        db.add(entry)
        created.append(entry)
    db.commit()
    for e in created:
        db.refresh(e)
    return created
