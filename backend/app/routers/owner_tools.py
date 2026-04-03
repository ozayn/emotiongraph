"""Owner-only read-only internal summary (environment, migrations, coarse stats)."""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.admin_access import admin_email_allowlist_set
from app.config import DEFAULT_CORS_ORIGINS, settings
from app.deps import get_db, require_owner_user
from app.models import LogEntry, User
from app.owner_access import owner_email_allowlist_set
from app.schemas_owner_tools import (
    OwnerDebugBlock,
    OwnerEnvironmentBlock,
    OwnerMigrationsBlock,
    OwnerSummaryResponse,
    OwnerUsageBlock,
)
from app.tracker_config_models import TrackerFieldDefinition

router = APIRouter(prefix="/owner", tags=["owner"])


def _alembic_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "alembic"


def _script_head_info() -> tuple[str | None, bool]:
    try:
        cfg = Config()
        cfg.set_main_option("script_location", str(_alembic_dir()))
        script = ScriptDirectory.from_config(cfg)
        heads = script.get_heads()
        if len(heads) == 1:
            return heads[0], False
        return None, len(heads) > 1
    except Exception:
        return None, False


def _database_profile() -> str:
    u = (settings.database_url or "").strip().lower()
    if u.startswith("sqlite"):
        return "sqlite"
    if "postgresql" in u or u.startswith("postgres"):
        return "postgresql"
    return "other"


def _cors_allowed_origin_count() -> int:
    from_env = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    from_default = [o.strip() for o in DEFAULT_CORS_ORIGINS.split(",") if o.strip()]
    return len(dict.fromkeys(from_default + from_env))


def _migrations_block(db: Session) -> OwnerMigrationsBlock:
    head_rev, multi = _script_head_info()
    current: list[str] = []
    try:
        cur_rows = db.execute(text("SELECT version_num FROM alembic_version")).fetchall()
        current = [str(r[0]) for r in cur_rows if r and r[0] is not None]
    except Exception:
        current = []

    at_head: bool | None = None
    if multi:
        at_head = None
    elif len(current) == 1 and head_rev is not None:
        at_head = current[0] == head_rev
    elif len(current) == 0:
        at_head = None
    else:
        at_head = False

    return OwnerMigrationsBlock(
        current_revisions=current,
        script_head_revision=head_rev,
        script_has_multiple_heads=multi,
        database_at_head=at_head,
    )


@router.get("/summary", response_model=OwnerSummaryResponse)
def owner_summary(
    db: Session = Depends(get_db),
    _: int = Depends(require_owner_user),
) -> OwnerSummaryResponse:
    env = OwnerEnvironmentBlock(
        database_profile=_database_profile(),
        cors_allowed_origin_count=_cors_allowed_origin_count(),
        allow_unauthenticated_full_user_list=settings.allow_unauthenticated_full_user_list,
        allow_public_demo_user_list=settings.allow_public_demo_user_list,
        allow_x_user_id_any=settings.allow_x_user_id_any,
        admin_allowlist_configured=len(admin_email_allowlist_set()) > 0,
        owner_allowlist_configured=len(owner_email_allowlist_set()) > 0,
    )
    migrations = _migrations_block(db)
    usage = OwnerUsageBlock(
        user_count=db.query(User).count(),
        log_entry_count=db.query(LogEntry).count(),
        tracker_field_definition_count=db.query(TrackerFieldDefinition).count(),
    )
    debug = OwnerDebugBlock()
    return OwnerSummaryResponse(environment=env, migrations=migrations, usage=usage, debug=debug)
