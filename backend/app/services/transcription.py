from io import BytesIO

from openai import OpenAI

from app.config import settings


def transcribe_audio_bytes(filename: str, data: bytes) -> str:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    client = OpenAI(api_key=settings.openai_api_key)
    bio = BytesIO(data)
    bio.name = filename or "audio.webm"
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=bio,
    )
    return transcript.text.strip()
