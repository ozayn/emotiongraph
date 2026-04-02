import logging
import time
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import ProgrammingError
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


def _pg_table_columns(conn, table: str) -> set[str]:
    rows = conn.execute(
        text(
            "SELECT c.column_name FROM information_schema.columns c "
            "WHERE c.table_schema = current_schema() AND c.table_name = :t"
        ),
        {"t": table},
    )
    return {r[0] for r in rows}


def _pg_table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = current_schema() AND table_name = :t"
        ),
        {"t": table},
    ).first()
    return row is not None


def _pg_first_user_id(conn) -> int | None:
    return conn.execute(text("SELECT id FROM users ORDER BY id ASC LIMIT 1")).scalar_one_or_none()


def _pg_drop_tracker_days_unique_on_log_date_only(conn) -> None:
    """Old single-tenant schema often had UNIQUE(log_date); composite PK needs it dropped."""
    rows = conn.execute(
        text(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_schema = kcu.constraint_schema
             AND tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = current_schema()
              AND tc.table_name = 'tracker_days'
              AND tc.constraint_type = 'UNIQUE'
            GROUP BY tc.constraint_name
            HAVING array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) = ARRAY['log_date']::text[]
            """
        )
    ).fetchall()
    for (name,) in rows:
        conn.execute(text(f'ALTER TABLE tracker_days DROP CONSTRAINT "{name}"'))


def upgrade_rdbms_schema_for_multiuser() -> None:
    """
    PostgreSQL (e.g. Railway): existing DBs created before multi-user support may lack
    log_entries.user_id (and related columns) or use a pre-composite tracker_days PK.
    SQLAlchemy create_all() does not ALTER legacy tables, which surfaces as 500s on /insights.

    Safe to call on every startup (idempotent). SQLite uses file reset instead; other dialects skipped.
    """
    if _RESOLVED_URL.lower().startswith("sqlite"):
        return
    if engine.dialect.name != "postgresql":
        logger.info("Skipping PostgreSQL multi-user migration (dialect=%s)", engine.dialect.name)
        return

    with engine.begin() as conn:
        if not _pg_table_exists(conn, "users"):
            logger.warning("PostgreSQL migration skipped: users table missing")
            return

        uid = _pg_first_user_id(conn)
        if uid is None:
            logger.warning(
                "PostgreSQL migration skipped: no rows in users (cannot backfill user_id)"
            )
            return

        if _pg_table_exists(conn, "log_entries"):
            cols = _pg_table_columns(conn, "log_entries")

            if "user_id" not in cols:
                logger.warning(
                    "Migrating log_entries: adding user_id=%s for legacy rows (pre-multi-user schema)",
                    uid,
                )
                conn.execute(text("ALTER TABLE log_entries ADD COLUMN user_id INTEGER"))
                conn.execute(
                    text("UPDATE log_entries SET user_id = :uid WHERE user_id IS NULL"), {"uid": uid}
                )
                conn.execute(text("ALTER TABLE log_entries ALTER COLUMN user_id SET NOT NULL"))
                try:
                    conn.execute(
                        text(
                            "ALTER TABLE log_entries ADD CONSTRAINT fk_log_entries_user_id "
                            "FOREIGN KEY (user_id) REFERENCES users(id)"
                        )
                    )
                except ProgrammingError as e:
                    logger.debug("log_entries user_id FK (may already exist): %s", e)

            cols = _pg_table_columns(conn, "log_entries")
            if "created_at" not in cols:
                logger.warning("Migrating log_entries: adding created_at")
                conn.execute(text("ALTER TABLE log_entries ADD COLUMN created_at TIMESTAMPTZ"))
                conn.execute(text("UPDATE log_entries SET created_at = NOW() WHERE created_at IS NULL"))
                conn.execute(text("ALTER TABLE log_entries ALTER COLUMN created_at SET NOT NULL"))

            cols = _pg_table_columns(conn, "log_entries")
            if "source_type" not in cols:
                logger.warning("Migrating log_entries: adding source_type")
                conn.execute(text("ALTER TABLE log_entries ADD COLUMN source_type VARCHAR(16)"))
                conn.execute(
                    text("UPDATE log_entries SET source_type = 'manual' WHERE source_type IS NULL")
                )
                conn.execute(text("ALTER TABLE log_entries ALTER COLUMN source_type SET NOT NULL"))
                conn.execute(
                    text("ALTER TABLE log_entries ALTER COLUMN source_type SET DEFAULT 'manual'")
                )

            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_log_entries_user_log_date "
                    "ON log_entries (user_id, log_date)"
                )
            )
            try:
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_log_entries_user_id ON log_entries (user_id)")
                )
            except ProgrammingError:
                pass

        if not _pg_table_exists(conn, "tracker_days"):
            return

        tcols = _pg_table_columns(conn, "tracker_days")
        want_pk = {"user_id", "log_date"}

        if "user_id" not in tcols:
            logger.warning("Migrating tracker_days: adding user_id for legacy rows")
            conn.execute(text("ALTER TABLE tracker_days ADD COLUMN user_id INTEGER"))
            conn.execute(
                text("UPDATE tracker_days SET user_id = :uid WHERE user_id IS NULL"), {"uid": uid}
            )
            conn.execute(text("ALTER TABLE tracker_days ALTER COLUMN user_id SET NOT NULL"))
            try:
                conn.execute(
                    text(
                        "ALTER TABLE tracker_days ADD CONSTRAINT fk_tracker_days_user_id "
                        "FOREIGN KEY (user_id) REFERENCES users(id)"
                    )
                )
            except ProgrammingError as e:
                logger.debug("tracker_days user_id FK (may already exist): %s", e)

        tcols = _pg_table_columns(conn, "tracker_days")
        if "user_id" not in tcols:
            return

        pk_row = conn.execute(
            text(
                """
                SELECT tc.constraint_name,
                       array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS cols
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_schema = kcu.constraint_schema
                 AND tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = current_schema()
                  AND tc.table_name = 'tracker_days'
                  AND tc.constraint_type = 'PRIMARY KEY'
                GROUP BY tc.constraint_name
                """
            )
        ).first()

        raw_pk_cols = pk_row[1] if pk_row else None
        if raw_pk_cols is None:
            pk_cols: set[str] = set()
        elif isinstance(raw_pk_cols, (list, tuple)):
            pk_cols = set(raw_pk_cols)
        else:
            pk_cols = {str(raw_pk_cols)}
        if pk_cols == want_pk:
            return

        logger.warning(
            "Migrating tracker_days: replacing primary key %s with (user_id, log_date)",
            pk_cols or "(none)",
        )
        _pg_drop_tracker_days_unique_on_log_date_only(conn)

        if pk_row and pk_row[0]:
            try:
                conn.execute(text(f'ALTER TABLE tracker_days DROP CONSTRAINT "{pk_row[0]}"'))
            except ProgrammingError as e:
                logger.debug("drop tracker_days PK: %s", e)

        try:
            conn.execute(
                text("ALTER TABLE tracker_days ADD PRIMARY KEY (user_id, log_date)")
            )
        except ProgrammingError as e:
            logger.error("Could not add composite PK on tracker_days: %s", e)
            raise


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
