from datetime import date

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import DEFAULT_CORS_ORIGINS, settings
from app.db import Base, SessionLocal, engine, get_db, upgrade_rdbms_schema_for_multiuser
from app.deps import require_user_id
from app.models import LogEntry, TrackerDay, User
from app.routers.export_csv import router as export_csv_router
from app.routers.insights import router as insights_router
from app.routers.tracker_config import router as tracker_config_router
from app.services.tracker_config_seed import seed_tracker_config_if_empty
from app.services.user_seed import seed_users_if_empty
from app.schemas import (
    ExtractLogsRequest,
    ExtractLogsResponse,
    LogEntryRead,
    SaveLogsRequest,
    TrackerDayRead,
    TrackerDayUpsert,
    UserRead,
)
from app.services.extraction import extract_logs_from_transcript, extraction_service_configured
from app.services.transcription import is_transcript_usable, transcribe_audio_bytes

Base.metadata.create_all(bind=engine)

_db_seed = SessionLocal()
try:
    seed_users_if_empty(_db_seed)
    seed_tracker_config_if_empty(_db_seed)
finally:
    _db_seed.close()

upgrade_rdbms_schema_for_multiuser()


def _cors_allow_origins() -> list[str]:
    """Explicit origin list only: credentialed fetches are invalid with Access-Control-Allow-Origin: *."""
    parts = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if not parts:
        parts = [o.strip() for o in DEFAULT_CORS_ORIGINS.split(",") if o.strip()]
    return list(dict.fromkeys(parts))


app = FastAPI(title="EmotionGraph API")

# Apply CORS before registering routes so every path (/, /insights, /export/..., /tracker-config, …)
# receives the same middleware stack; included routers are still wrapped by this app instance.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracker_config_router)
app.include_router(insights_router, prefix="/insights", tags=["insights"])
app.include_router(export_csv_router, prefix="/export", tags=["export"])


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/users", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id.asc()).all()


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
    if not extraction_service_configured():
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY or GROQ_API_KEY is not configured (extraction)",
        )
    try:
        return extract_logs_from_transcript(body.transcript, body.log_date.isoformat())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"invalid model JSON: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/tracker-day", response_model=TrackerDayRead)
def get_tracker_day(
    log_date: date,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    row = (
        db.query(TrackerDay)
        .filter(TrackerDay.user_id == user_id, TrackerDay.log_date == log_date)
        .one_or_none()
    )
    if row is None:
        return TrackerDayRead(
            user_id=user_id,
            log_date=log_date,
            cycle_day=None,
            sleep_hours=None,
            sleep_quality=None,
        )
    return row


@app.put("/tracker-day", response_model=TrackerDayRead)
def put_tracker_day(
    body: TrackerDayUpsert,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    row = (
        db.query(TrackerDay)
        .filter(TrackerDay.user_id == user_id, TrackerDay.log_date == body.log_date)
        .one_or_none()
    )
    if row is None:
        row = TrackerDay(user_id=user_id, log_date=body.log_date)
        db.add(row)
    row.cycle_day = body.cycle_day
    row.sleep_hours = body.sleep_hours
    row.sleep_quality = body.sleep_quality
    db.commit()
    db.refresh(row)
    return row


@app.get("/logs", response_model=list[LogEntryRead])
def list_logs(
    log_date: date,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    rows = (
        db.query(LogEntry)
        .filter(LogEntry.user_id == user_id, LogEntry.log_date == log_date)
        .order_by(LogEntry.id.asc())
        .all()
    )
    return rows


@app.post("/logs", response_model=list[LogEntryRead])
def save_logs(
    body: SaveLogsRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    created: list[LogEntry] = []
    for r in body.rows:
        entry = LogEntry(
            user_id=user_id,
            log_date=body.log_date,
            start_time=r.start_time,
            end_time=r.end_time,
            event=r.event,
            energy_level=r.energy_level,
            anxiety=r.anxiety,
            contentment=r.contentment,
            focus=r.focus,
            music=r.music,
            comments=r.comments,
            source_type=r.source_type,
        )
        db.add(entry)
        created.append(entry)
    db.commit()
    for e in created:
        db.refresh(e)
    return created
