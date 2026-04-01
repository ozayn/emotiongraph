from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: str = ""
    groq_openai_base_url: str = "https://api.groq.com/openai/v1"
    groq_transcription_model: str = "whisper-large-v3-turbo"

    openai_api_key: str = ""
    database_url: str = "sqlite:///./emotiongraph.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


settings = Settings()
