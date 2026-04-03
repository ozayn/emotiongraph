"""Response models for owner-only read-only dashboards."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OwnerEnvironmentBlock(BaseModel):
    """Non-secret deployment hints (no URLs with credentials, no API keys)."""

    database_profile: str = Field(
        description="sqlite | postgresql | other — derived from DATABASE_URL scheme only.",
    )
    cors_allowed_origin_count: int = Field(ge=0)
    allow_unauthenticated_full_user_list: bool
    allow_public_demo_user_list: bool
    allow_x_user_id_any: bool
    admin_allowlist_configured: bool
    owner_allowlist_configured: bool


class OwnerMigrationsBlock(BaseModel):
    """Alembic state visible in the connected database."""

    current_revisions: list[str] = Field(default_factory=list)
    script_head_revision: str | None = None
    script_has_multiple_heads: bool = False
    database_at_head: bool | None = Field(
        default=None,
        description="True when DB has exactly one revision row and it matches the single script head.",
    )


# Old name (pre–Pydantic `schema` shadow fix); kept so stray imports never crash.
OwnerSchemaBlock = OwnerMigrationsBlock


class OwnerUsageBlock(BaseModel):
    """Aggregate counts only."""

    user_count: int = Field(ge=0)
    log_entry_count: int = Field(ge=0)
    tracker_field_definition_count: int = Field(ge=0)


class OwnerDebugBlock(BaseModel):
    """Documentation for existing owner-gated diagnostics (no execute from this payload)."""

    log_save_dry_run_post_path: str = "/debug/logs"
    note: str = "POST with the same JSON body as POST /logs; validates and builds ORM rows without committing."


class OwnerSummaryResponse(BaseModel):
    environment: OwnerEnvironmentBlock
    migrations: OwnerMigrationsBlock
    usage: OwnerUsageBlock
    debug: OwnerDebugBlock
