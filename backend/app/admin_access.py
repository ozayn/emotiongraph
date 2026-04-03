"""Minimal admin gate: allowlisted emails only (no full RBAC)."""

from __future__ import annotations

from app.config import settings
from app.models import User
from app.owner_access import is_owner_email
from app.schemas import UserRead


def admin_email_allowlist_set() -> frozenset[str]:
    raw = (settings.admin_email_allowlist or "").strip()
    if not raw:
        return frozenset()
    return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())


def is_admin_email(email: str | None) -> bool:
    if not email or not str(email).strip():
        return False
    allow = admin_email_allowlist_set()
    if not allow:
        return False
    return str(email).strip().lower() in allow


def user_read_from_user(row: User) -> UserRead:
    base = UserRead.model_validate(row)
    return base.model_copy(
        update={
            "is_admin": is_admin_email(row.email),
            "is_owner": is_owner_email(row.email),
        }
    )
