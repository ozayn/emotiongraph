from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve backend/.env regardless of process cwd (uvicorn from repo root, IDE, etc.)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"

# Credentialed browser requests require explicit origins — CORS cannot use "*" with credentials.
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "https://emotiongraph.ozayn.com,"
    "https://web-production-abed5.up.railway.app"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    groq_api_key: str = ""
    groq_openai_base_url: str = "https://api.groq.com/openai/v1"
    groq_transcription_model: str = "whisper-large-v3-turbo"
    groq_extraction_model: str = "llama-3.3-70b-versatile"

    anthropic_api_key: str = ""
    anthropic_extraction_model: str = "claude-sonnet-4-20250514"
    anthropic_timeout_seconds: float = 90.0
    database_url: str = "sqlite:///./emotiongraph.db"
    # Comma-separated browser origins (must match the requesting page origin exactly).
    cors_origins: str = DEFAULT_CORS_ORIGINS

    use_outbound_proxy: bool = False
    outbound_proxy_url: str = ""

    # Google Sign-In (GIS): Web client ID from Google Cloud Console (OAuth 2.0 Client IDs).
    google_oauth_client_id: str = ""
    # HS256 secret for API access JWTs issued after Google sign-in. Use a long random string in production.
    auth_jwt_secret: str = ""
    auth_jwt_exp_seconds: int = 604800  # 7 days

    # GET /users with X-Public-Demo: 1 (demo frontend only): list @emotiongraph.local seed users.
    allow_public_demo_user_list: bool = True
    # GET /users with no Bearer and no demo header: list all users (local / legacy private picker). Disable in locked-down production.
    allow_unauthenticated_full_user_list: bool = True
    # Accept X-User-Id for any existing user (insecure; local tooling only). Demo users work without this via @emotiongraph.local.
    allow_x_user_id_any: bool = False

    # Comma-separated Google (or local) emails allowed to use /admin and /tracker-config. Empty = no admins.
    admin_email_allowlist: str = ""
    # Comma-separated emails for owner-only API routes and /owner UI (internal tools). Empty = no owners.
    # Independent of admin: admins configure product fields; owners get operational/debug surfaces.
    owner_email_allowlist: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def cors_origins_non_empty(cls, v: object) -> str:
        """Empty CORS_ORIGINS in env would break credentialed requests; fall back to defaults."""
        if v is None:
            return DEFAULT_CORS_ORIGINS
        if isinstance(v, str) and not v.strip():
            return DEFAULT_CORS_ORIGINS
        return str(v).strip()


settings = Settings()
