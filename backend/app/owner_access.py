"""Owner gate: stricter allowlist for internal / operational API and UI (separate from admin)."""

from __future__ import annotations

from app.config import settings


def owner_email_allowlist_set() -> frozenset[str]:
    raw = (settings.owner_email_allowlist or "").strip()
    if not raw:
        return frozenset()
    return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())


def is_owner_email(email: str | None) -> bool:
    if not email or not str(email).strip():
        return False
    allow = owner_email_allowlist_set()
    if not allow:
        return False
    return str(email).strip().lower() in allow
