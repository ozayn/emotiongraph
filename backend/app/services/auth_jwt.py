"""HS256 access tokens for authenticated API calls after Google sign-in."""

from __future__ import annotations

import time

import jwt

from app.config import settings

ALGORITHM = "HS256"


def issue_access_token(user_id: int) -> tuple[str, int]:
    if not settings.auth_jwt_secret or len(settings.auth_jwt_secret.strip()) < 16:
        raise RuntimeError("AUTH_JWT_SECRET is missing or too short")
    now = int(time.time())
    exp = now + max(60, int(settings.auth_jwt_exp_seconds))
    payload = {"sub": str(user_id), "iat": now, "exp": exp, "typ": "access"}
    token = jwt.encode(payload, settings.auth_jwt_secret, algorithm=ALGORITHM)
    return token if isinstance(token, str) else token.decode("utf-8"), exp - now


def decode_access_token_user_id(token: str) -> int:
    if not settings.auth_jwt_secret:
        raise jwt.InvalidTokenError("server not configured for JWT")
    payload = jwt.decode(
        token,
        settings.auth_jwt_secret,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "iat", "sub"]},
    )
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return int(str(payload["sub"]))
