"""Scaffold for optional outbound HTTP proxy (not wired into clients yet)."""

from app.config import settings


def get_outbound_proxy_url() -> str | None:
    """Return the full proxy URL when enabled and set; otherwise None."""
    if not settings.use_outbound_proxy:
        return None
    url = (settings.outbound_proxy_url or "").strip()
    if not url:
        return None
    return url
