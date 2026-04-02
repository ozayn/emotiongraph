"""Alembic environment: uses the same DATABASE_URL normalization as the FastAPI app."""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

# Backend root on sys.path (alembic.ini lives in backend/)
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.db import Base, engine_kwargs_for_url, normalize_database_url  # noqa: E402

import app.models  # noqa: E402, F401
import app.tracker_config_models  # noqa: E402, F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return normalize_database_url(settings.database_url)


def _sqlite_batch(url: str) -> bool:
    return url.lower().startswith("sqlite")


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=_sqlite_batch(url),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = get_url()
    connectable = create_engine(
        url,
        poolclass=pool.NullPool,
        **engine_kwargs_for_url(url),
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=_sqlite_batch(url),
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
