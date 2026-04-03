from __future__ import annotations

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.admin_access import is_admin_email
from app.owner_access import is_owner_email
from app.config import settings
from app.db import get_db
from app.models import User
from app.services.auth_jwt import decode_access_token_user_id
from app.services.user_seed import DEMO_SANDBOX_EMAIL


def resolve_bearer_user_id(authorization: str | None, db: Session) -> int | None:
    if not authorization or not str(authorization).startswith("Bearer "):
        return None
    token = str(authorization)[7:].strip()
    if not token:
        return None
    try:
        uid = decode_access_token_user_id(token)
    except jwt.PyJWTError:
        return None
    if db.get(User, uid) is None:
        return None
    return uid


def _enforce_demo_sandbox_user(x_public_demo: str | None, row: User) -> None:
    if (x_public_demo or "").strip() != "1":
        return
    if row.email.lower() != DEMO_SANDBOX_EMAIL.lower():
        raise HTTPException(
            status_code=403,
            detail="Public demo may only use the Test sample profile.",
        )


def require_user_id(
    authorization: str | None = Header(None),
    x_user_id: str | None = Header(None, alias="X-User-Id"),
    x_public_demo: str | None = Header(None, alias="X-Public-Demo"),
    db: Session = Depends(get_db),
) -> int:
    bearer_uid = resolve_bearer_user_id(authorization, db)
    if bearer_uid is not None:
        row = db.get(User, bearer_uid)
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        _enforce_demo_sandbox_user(x_public_demo, row)
        return bearer_uid

    if x_user_id is None or not str(x_user_id).strip():
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        uid = int(str(x_user_id).strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid X-User-Id")

    row = db.get(User, uid)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    _enforce_demo_sandbox_user(x_public_demo, row)

    if settings.allow_x_user_id_any:
        return uid

    if row.email.endswith("@emotiongraph.local"):
        return uid

    raise HTTPException(
        status_code=401,
        detail="Use a signed-in session for this account (Bearer token required).",
    )


def require_admin_user(
    user_id: int = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> int:
    row = db.get(User, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not is_admin_email(row.email):
        raise HTTPException(
            status_code=403,
            detail="Admin access is limited to allowlisted accounts.",
        )
    return user_id


def require_owner_user(
    user_id: int = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> int:
    row = db.get(User, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not is_owner_email(row.email):
        raise HTTPException(
            status_code=403,
            detail="Owner access is limited to allowlisted accounts.",
        )
    return user_id
