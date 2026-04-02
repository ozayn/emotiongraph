"""POST /auth/google — exchange a verified Google ID token for an API access JWT."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User
from app.schemas import AuthTokenResponse, GoogleAuthBody, UserRead
from app.services.auth_jwt import issue_access_token
from app.services.google_id_token import verify_google_credential

logger = logging.getLogger(__name__)

router = APIRouter()


def _normalize_email(raw: str) -> str:
    return str(raw).strip().lower()


@router.post("/google", response_model=AuthTokenResponse)
def auth_google(body: GoogleAuthBody, db: Session = Depends(get_db)) -> AuthTokenResponse:
    if not settings.google_oauth_client_id or not settings.auth_jwt_secret:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on this server (GOOGLE_OAUTH_CLIENT_ID / AUTH_JWT_SECRET).",
        )
    try:
        claims = verify_google_credential(body.credential, settings.google_oauth_client_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 — map to safe client error
        logger.warning("Google token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid Google credential") from e

    sub = claims.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Google token missing subject")

    email_raw = claims.get("email")
    if not email_raw or not isinstance(email_raw, str):
        raise HTTPException(status_code=400, detail="Google account has no email on this token")
    if not claims.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google email must be verified")

    email = _normalize_email(email_raw)
    if len(email) > 256:
        raise HTTPException(status_code=400, detail="Email too long")

    display_name = claims.get("name")
    if not display_name or not isinstance(display_name, str) or not display_name.strip():
        display_name = email.split("@", 1)[0]
    display_name = display_name.strip()[:128]

    user = db.query(User).filter(User.google_sub == sub).first()
    if user is None:
        by_email = db.query(User).filter(User.email == email).first()
        if by_email is not None:
            if by_email.google_sub is not None and by_email.google_sub != sub:
                raise HTTPException(
                    status_code=409,
                    detail="This email is already linked to another Google account.",
                )
            if by_email.email.endswith("@emotiongraph.local"):
                raise HTTPException(
                    status_code=403,
                    detail="This Google account cannot use a reserved demo email domain.",
                )
            by_email.google_sub = sub
            if not by_email.name.strip():
                by_email.name = display_name
            db.commit()
            db.refresh(by_email)
            user = by_email
        else:
            user = User(name=display_name, email=email, google_sub=sub)
            db.add(user)
            db.commit()
            db.refresh(user)

    try:
        token, ttl = issue_access_token(user.id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    return AuthTokenResponse(access_token=token, expires_in=ttl, user=UserRead.model_validate(user))
