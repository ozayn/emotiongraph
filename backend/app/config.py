from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve backend/.env regardless of process cwd (uvicorn from repo root, IDE, etc.)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"


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

    openai_api_key: str = ""
    openai_extraction_model: str = "gpt-4o-mini"
    database_url: str = "sqlite:///./emotiongraph.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


settings = Settings()
