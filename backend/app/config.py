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
