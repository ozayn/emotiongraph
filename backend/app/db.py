import logging
import time
from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)


def normalize_database_url(url: str) -> str:
    """
    Return a SQLAlchemy URL suitable for the installed drivers.

    - SQLite URLs are passed through unchanged.
    - Heroku/Railway-style ``postgres://...`` is rewritten for psycopg (v3).
    - Bare ``postgresql://...`` (no +driver) is upgraded to ``postgresql+psycopg://``
      so SQLAlchemy does not assume psycopg2, which we do not install.
    URLs that already specify a driver (e.g. ``postgresql+psycopg2://``) are left as-is.
    """
    url = url.strip()
    if not url:
        raise ValueError("DATABASE_URL is empty")

    lower = url.lower()
    if lower.startswith("sqlite"):
        return url

    if lower.startswith("postgres://"):
        return "postgresql+psycopg://" + url.split("://", 1)[1]

    if lower.startswith("postgresql://") and not lower.startswith("postgresql+"):
        return "postgresql+psycopg://" + url.split("://", 1)[1]

    return url


def engine_kwargs_for_url(url: str) -> dict:
    """Dialect-specific options. Never pass SQLite-only connect_args to PostgreSQL."""
    lower = url.lower()
    if lower.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True}


_RESOLVED_URL = normalize_database_url(settings.database_url)
_ENGINE_KWARGS = engine_kwargs_for_url(_RESOLVED_URL)

engine = create_engine(_RESOLVED_URL, **_ENGINE_KWARGS)


def _sqlite_database_file_path(url: str) -> Path | None:
    """Absolute path to the main SQLite database file, or None for :memory: / unexpected URLs."""
    from sqlalchemy.engine.url import make_url

    u = make_url(url)
    if not u.database or u.database == ":memory:":
        return None
    p = Path(u.database)
    if not p.is_absolute():
        p = Path.cwd() / p
    return p.resolve()


def _sqlite_wal_shm_paths(db_path: Path) -> list[Path]:
    return [Path(str(db_path) + ext) for ext in ("-wal", "-shm")]


def _sqlite_schema_requires_new_file(insp) -> bool:
    """
    True if an existing SQLite file predates multi-user schema (users, user_id, composite tracker_days).

    SQLAlchemy create_all() never alters existing tables, so old files keep missing columns and
    queries raise OperationalError (surfacing as HTTP 500).
    """
    if insp.has_table("log_entries"):
        cols = {c["name"] for c in insp.get_columns("log_entries")}
        if "user_id" not in cols:
            return True
    if insp.has_table("tracker_days"):
        cols = {c["name"] for c in insp.get_columns("tracker_days")}
        if "user_id" not in cols:
            return True
        pk = insp.get_pk_constraint("tracker_days")
        pk_cols = set(pk.get("constrained_columns") or [])
        if pk_cols != {"user_id", "log_date"}:
            return True
    if insp.has_table("log_entries") and not insp.has_table("users"):
        return True
    return False


def _maybe_reset_stale_sqlite_file() -> None:
    """
    For local file-based SQLite only: if the DB file matches a pre-multi-user layout, rename it
    aside so create_all can build a fresh schema. PostgreSQL and :memory: SQLite are untouched.
    """
    global engine

    url = _RESOLVED_URL.lower()
    if not url.startswith("sqlite") or ":memory:" in url:
        return

    db_path = _sqlite_database_file_path(_RESOLVED_URL)
    if db_path is None:
        return

    try:
        insp = inspect(engine)
    except Exception:
        logger.exception("Could not inspect SQLite database; leaving file unchanged")
        return

    if not _sqlite_schema_requires_new_file(insp):
        return

    if not db_path.is_file():
        return

    engine.dispose()
    backup = db_path.with_name(f"{db_path.name}.bak.{int(time.time())}")
    db_path.rename(backup)
    for side in _sqlite_wal_shm_paths(db_path):
        if side.is_file():
            side.unlink(missing_ok=True)

    logger.warning(
        "Local SQLite database had an outdated schema (missing users / user_id / composite tracker_days). "
        "Renamed it to %s — a fresh database will be created on startup. Old rows were not migrated.",
        backup.name,
    )

    engine = create_engine(_RESOLVED_URL, **_ENGINE_KWARGS)


_maybe_reset_stale_sqlite_file()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Register optional models on the same Base metadata (create_all in main).
import app.tracker_config_models  # noqa: E402, F401
