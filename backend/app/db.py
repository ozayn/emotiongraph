from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


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
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
