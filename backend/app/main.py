import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session

from app.admin_access import user_read_from_user
from app.config import DEFAULT_CORS_ORIGINS, settings
from app.db import (
    SessionLocal,
    ensure_schema_via_alembic,
    ensure_users_timezone_column,
    get_db,
    upgrade_rdbms_schema_for_multiuser,
)
from app.deps import require_user_id, resolve_bearer_user_id
from app.models import LogEntry, TrackerDay, User
from app.routers.auth_google import router as auth_google_router
from app.routers.export_csv import router as export_csv_router
from app.routers.insights import router as insights_router
from app.routers.tracker_config import router as tracker_config_router
from app.services.tracker_config_seed import seed_tracker_config_if_empty
from app.services.user_seed import DEMO_SANDBOX_EMAIL, seed_users_if_empty
from app.schemas import (
    ExtractLogsRequest,
    ExtractLogsResponse,
    LogEntryPatch,
    LogEntryRead,
    DebugLogsSaveResponse,
    LogsImportCommitRequest,
    LogsImportPreviewResponse,
    SaveLogsRequest,
    TrackerDayRead,
    TrackerDayUpsert,
    UserRead,
    UserTimezoneUpdate,
)
from app.services.extraction import extract_logs_from_transcript, extraction_service_configured
from app.services.logs_csv_import import (
    MAX_IMPORT_BYTES,
    execute_log_import,
    parse_logs_import_csv,
)
from app.services.transcription import (
    NO_USABLE_SPEECH_MESSAGE,
    is_effectively_silent_upload,
    is_likely_silence_hallucination_transcript,
    is_transcript_usable,
    transcribe_audio_bytes,
)

logger = logging.getLogger(__name__)


def _pending_log_entry_snapshot(entry: LogEntry) -> dict:
    """TEMP diagnostics: values ORM will persist (pre-commit)."""
    ld = entry.log_date
    return {
        "user_id": entry.user_id,
        "log_date": ld.isoformat() if ld is not None else None,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "event": entry.event,
        "energy_level": entry.energy_level,
        "anxiety": entry.anxiety,
        "contentment": entry.contentment,
        "focus": entry.focus,
        "music": entry.music,
        "comments": entry.comments,
        "source_type": entry.source_type,
    }


def _dbapi_exc_parts(exc: BaseException) -> tuple[str | None, str | None]:
    o = getattr(exc, "orig", None)
    if o is None:
        return None, None
    return type(o).__name__, str(o)


def _statement_preview(exc: BaseException) -> str | None:
    if isinstance(exc, StatementError):
        st = getattr(exc, "statement", None)
        if st:
            s = str(st)
            return s if len(s) <= 2000 else s[:2000] + "…"
    return None


ensure_schema_via_alembic()
ensure_users_timezone_column()

_db_seed = SessionLocal()
try:
    seed_users_if_empty(_db_seed)
    seed_tracker_config_if_empty(_db_seed)
finally:
    _db_seed.close()

upgrade_rdbms_schema_for_multiuser()


def _cors_allow_origins() -> list[str]:
    """Explicit origin list only: credentialed fetches are invalid with Access-Control-Allow-Origin: *.

    ``CORS_ORIGINS`` from the environment replaces the Settings default string, which often drops
    the bundled production domain (e.g. a custom domain). We always union with ``DEFAULT_CORS_ORIGINS``
    so ``https://emotiongraph.ozayn.com`` and local dev origins stay allowed unless you fork defaults.
    """
    from_env = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    from_default = [o.strip() for o in DEFAULT_CORS_ORIGINS.split(",") if o.strip()]
    merged = list(dict.fromkeys(from_default + from_env))
    return merged


def _cors_headers_for_request(request: Request) -> dict[str, str]:
    """Match CORSMiddleware for bodies produced in exception handlers (those responses skip middleware CORS)."""
    origin = request.headers.get("origin")
    if not origin or origin not in set(_cors_allow_origins()):
        return {}
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "vary": "Origin",
    }


@asynccontextmanager
async def _app_lifespan(_app: FastAPI):
    """Emit an unmistakable line once Uvicorn has loaded the app (confirms API vs static web service logs)."""
    print(
        "[emotiongraph-api] FastAPI startup complete — tail THIS service's Deploy Logs while hitting the API.",
        flush=True,
    )
    logger.info("EmotionGraph API ready.")
    yield


app = FastAPI(title="EmotionGraph API", lifespan=_app_lifespan)

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
app.include_router(auth_google_router, prefix="/auth", tags=["auth"])


@app.exception_handler(Exception)
async def _unhandled_exception_cors_friendly(request: Request, exc: Exception) -> JSONResponse:
    """JSON 500 plus explicit CORS headers — Starlette does not run CORSMiddleware on handler responses."""
    logger.error("Unhandled exception path=%s", request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=_cors_headers_for_request(request),
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/users", response_model=list[UserRead])
def list_users(
    authorization: str | None = Header(None),
    x_public_demo: str | None = Header(None, alias="X-Public-Demo"),
    db: Session = Depends(get_db),
):
    bearer_uid = resolve_bearer_user_id(authorization, db)
    if bearer_uid is not None:
        row = db.get(User, bearer_uid)
        return [user_read_from_user(row)] if row is not None else []
    if (x_public_demo or "").strip() == "1":
        if not settings.allow_public_demo_user_list:
            raise HTTPException(status_code=401, detail="Public demo user list is disabled")
        row = db.query(User).filter(User.email == DEMO_SANDBOX_EMAIL).order_by(User.id.asc()).first()
        return [user_read_from_user(row)] if row is not None else []
    if settings.allow_unauthenticated_full_user_list:
        return [user_read_from_user(r) for r in db.query(User).order_by(User.id.asc()).all()]
    raise HTTPException(status_code=401, detail="Authentication required")


@app.patch("/user/timezone", response_model=UserRead)
def patch_user_timezone(
    body: UserTimezoneUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    row = db.get(User, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    row.timezone = body.timezone
    db.commit()
    db.refresh(row)
    return user_read_from_user(row)


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")
    try:
        raw = await audio.read()
        if not raw:
            raise HTTPException(status_code=400, detail="empty upload")
        if is_effectively_silent_upload(raw, audio.filename or ""):
            raise HTTPException(status_code=422, detail=NO_USABLE_SPEECH_MESSAGE)
        text = transcribe_audio_bytes(audio.filename or "recording.webm", raw)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    if not is_transcript_usable(text):
        raise HTTPException(status_code=422, detail=NO_USABLE_SPEECH_MESSAGE)
    if is_likely_silence_hallucination_transcript(text):
        raise HTTPException(status_code=422, detail=NO_USABLE_SPEECH_MESSAGE)
    return {"transcript": text}


@app.post("/extract-logs", response_model=ExtractLogsResponse)
def extract_logs(body: ExtractLogsRequest):
    if not extraction_service_configured():
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY or GROQ_API_KEY is not configured (extraction)",
        )
    try:
        return extract_logs_from_transcript(
            body.transcript,
            body.log_date.isoformat(),
            body.capture_time_local,
            body.timezone,
            body.capture_kind,
        )
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
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
    log_date: date | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
):
    if log_date is not None:
        if start_date is not None or end_date is not None:
            raise HTTPException(
                status_code=400,
                detail="Use either log_date or both start_date and end_date, not both",
            )
        return (
            db.query(LogEntry)
            .filter(LogEntry.user_id == user_id, LogEntry.log_date == log_date)
            .order_by(LogEntry.id.asc())
            .all()
        )
    if start_date is None or end_date is None:
        raise HTTPException(
            status_code=400,
            detail="Provide log_date or both start_date and end_date",
        )
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    return (
        db.query(LogEntry)
        .filter(
            LogEntry.user_id == user_id,
            LogEntry.log_date >= start_date,
            LogEntry.log_date <= end_date,
        )
        .order_by(LogEntry.log_date.desc(), LogEntry.id.desc())
        .all()
    )


@app.patch("/logs/{entry_id}", response_model=LogEntryRead)
def patch_log_entry(
    entry_id: int,
    body: LogEntryPatch,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    row = db.get(LogEntry, entry_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Log entry not found")
    data = body.model_dump(exclude_unset=True)
    filtered = {
        k: v
        for k, v in data.items()
        if not (v is None and k in ("source_type", "log_date"))
    }
    if not filtered:
        db.refresh(row)
        return row
    for key, value in filtered.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@app.delete("/logs/{entry_id}", status_code=204)
def delete_log_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    row = db.get(LogEntry, entry_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.delete(row)
    db.commit()
    return None


@app.post("/logs", response_model=list[LogEntryRead])
def save_logs(
    body: SaveLogsRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    """
    Insert path (not exercised by POST /debug/logs): failures are usually at db.commit()
    (constraints, PK/sequence, FK, NOT NULL, type/length) or db.refresh() (ORM/DB column drift).
    Production alignment: Alembic initial_schema + upgrade_rdbms_schema_for_multiuser (Postgres)
    for user_id, created_at, source_type, indexes, and log_entries id sequence.
    """
    row_count = len(body.rows)
    created: list[LogEntry] = []
    try:
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
    except Exception as e:
        logger.error(
            "POST /logs failed during ORM build/db.add: sqlalchemy_type=%s sqlalchemy_message=%s "
            "dbapi_type=%s dbapi_message=%s user_id=%s log_date=%s row_count=%s",
            type(e).__name__,
            str(e),
            *_dbapi_exc_parts(e),
            user_id,
            body.log_date,
            row_count,
            exc_info=True,
        )
        raise

    pending_rows = [_pending_log_entry_snapshot(e) for e in created]
    logger.info(
        "POST /logs pending inserts user_id=%s log_date=%s row_count=%s rows=%s",
        user_id,
        body.log_date,
        row_count,
        pending_rows,
    )

    try:
        db.commit()
    except Exception as e:
        stmt = _statement_preview(e)
        logger.error(
            "POST /logs FAILED AT db.commit(): sqlalchemy_type=%s sqlalchemy_message=%s "
            "dbapi_type=%s dbapi_message=%s statement_preview=%s pending_rows=%s user_id=%s log_date=%s row_count=%s",
            type(e).__name__,
            str(e),
            *_dbapi_exc_parts(e),
            stmt,
            pending_rows,
            user_id,
            body.log_date,
            row_count,
            exc_info=True,
        )
        raise

    committed_ids = [getattr(e, "id", None) for e in created]
    logger.info(
        "POST /logs commit ok user_id=%s log_date=%s row_count=%s assigned_ids=%s",
        user_id,
        body.log_date,
        row_count,
        committed_ids,
    )

    for i, e in enumerate(created):
        try:
            db.refresh(e)
        except Exception as ex:
            stmt = _statement_preview(ex)
            snap = pending_rows[i] if i < len(pending_rows) else None
            logger.error(
                "POST /logs FAILED AT db.refresh(): refresh_index=%s sqlalchemy_type=%s sqlalchemy_message=%s "
                "dbapi_type=%s dbapi_message=%s statement_preview=%s entry_id_after_commit=%s "
                "pending_row_snapshot=%s all_assigned_ids=%s user_id=%s log_date=%s row_count=%s",
                i,
                type(ex).__name__,
                str(ex),
                *_dbapi_exc_parts(ex),
                stmt,
                getattr(e, "id", None),
                snap,
                committed_ids,
                user_id,
                body.log_date,
                row_count,
                exc_info=True,
            )
            raise

    return created


@app.post("/debug/logs", response_model=DebugLogsSaveResponse)
def debug_logs_save_dry_run(
    body: SaveLogsRequest,
    user_id: int = Depends(require_user_id),
):
    """Temporary: same body validation and ORM row build as POST /logs; does not persist."""
    for r in body.rows:
        LogEntry(
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
    return DebugLogsSaveResponse(
        user_id=user_id,
        log_date=body.log_date,
        row_count=len(body.rows),
        rows=list(body.rows),
    )


@app.post("/logs/import-csv/preview", response_model=LogsImportPreviewResponse)
async def logs_import_csv_preview(
    _: Annotated[int, Depends(require_user_id)],
    file: UploadFile = File(...),
):
    """Parse a UTF-8 CSV for bulk import; does not write to the database."""
    raw = await file.read()
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeError as e:
        raise HTTPException(status_code=400, detail="File must be UTF-8 text") from e
    rows, parse_errors = parse_logs_import_csv(text)
    return LogsImportPreviewResponse(rows=rows, parse_errors=parse_errors, row_count=len(rows))


@app.post("/logs/import-rows", response_model=list[LogEntryRead])
def logs_import_commit(
    body: LogsImportCommitRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    """Persist previewed rows with source_type import (and upsert tracker fields when present)."""
    try:
        created = execute_log_import(db, user_id, body.rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return created
