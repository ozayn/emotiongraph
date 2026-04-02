"""Verify Google Identity Services ID tokens (JWT) on the server."""

from __future__ import annotations

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


def verify_google_credential(credential: str, client_id: str) -> dict:
    """
    Validate the GIS credential JWT and return decoded claims.
    Raises ValueError on invalid token or audience mismatch.
    """
    if not client_id or not client_id.strip():
        raise ValueError("Google OAuth client id is not configured")
    # google-auth verifies signature, issuer, expiry, and audience.
    return id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        audience=client_id.strip(),
    )
