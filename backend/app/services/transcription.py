from io import BytesIO

from openai import OpenAI

from app.config import settings

# Groq exposes Whisper-class STT via an OpenAI-compatible API:
# https://console.groq.com/docs/speech-to-text


def transcribe_audio_bytes(filename: str, data: bytes) -> str:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    client = OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_openai_base_url,
    )
    bio = BytesIO(data)
    bio.name = filename or "audio.webm"
    transcript = client.audio.transcriptions.create(
        model=settings.groq_transcription_model,
        file=bio,
    )
    return transcript.text.strip()
