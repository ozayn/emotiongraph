import logging
import re
import shutil
import subprocess
import unicodedata
from io import BytesIO

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# Groq exposes Whisper-class STT via an OpenAI-compatible API:
# https://console.groq.com/docs/speech-to-text
# Whisper-class models transcribe many languages (e.g. English, Persian, Serbian) without a separate code path.

# Single user-facing message for silent / junk STT (matches API + UI).
NO_USABLE_SPEECH_MESSAGE = "No usable speech detected."

# FFmpeg volumedetect: typical silence clips sit around mean -55 dB or lower; speech usually louder.
# If ffmpeg is missing, we skip this check and rely on client energy + post-transcript heuristics.
_MEAN_DB_SILENT_MAX = -50.0
_MAX_DB_SILENT_MAX = -38.0

# Known short outputs Whisper-class models often emit on silence / noise with no speech.
_SILENCE_HALLUCINATION_FULL = re.compile(
    r"^\s*(?:"
    r"thanks?(\s+you)?|thank\s+you"
    r"|thanks?\s+for\s+watching\b[\s\S]*"
    r"|thank\s+you\s+for\s+watching\b[\s\S]*"
    r"|bye\b\.?"
    r"|hello\b\.?"
    r"|hi\b\.?"
    r"|\[music\]"
    r"|\(music\)"
    r"|\[silence\]"
    r"|\[blank\s*audio\]"
    r")[\s.!…]*$",
    re.IGNORECASE,
)

# YouTube-style junk; keep strict (whole-string match only via caller).
_SUBTITLE_CREDIT_FULL = re.compile(
    r"^\s*subtitles?(?:\s+by\b|\s*:\s*)[\s\S]*$",
    re.IGNORECASE,
)

_BRACKET_NOISE_FULL = re.compile(
    r"^\s*\[?(?:music|silence|applause|laughter|noise)\]?\s*$",
    re.IGNORECASE,
)


def is_transcript_usable(text: str) -> bool:
    """True if transcript has at least one character that is not whitespace or Unicode punctuation."""
    for ch in text:
        if ch.isspace():
            continue
        if unicodedata.category(ch).startswith("P"):
            continue
        return True
    return False


def _ffmpeg_volume_db(data: bytes) -> tuple[float | None, float | None]:
    """Return (mean_volume_db, max_volume_db) from ffmpeg volumedetect, or (None, None) if unavailable."""
    if not data or not shutil.which("ffmpeg"):
        return None, None
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "info",
        "-i",
        "pipe:0",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=data,
            capture_output=True,
            timeout=90,
        )
    except (OSError, subprocess.SubprocessError) as e:
        logger.debug("ffmpeg volumedetect failed: %s", e)
        return None, None
    err = proc.stderr.decode("utf-8", errors="replace")
    mean_m = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", err)
    max_m = re.search(r"max_volume:\s*([-\d.]+)\s*dB", err)
    mean_db = float(mean_m.group(1)) if mean_m else None
    max_db = float(max_m.group(1)) if max_m else None
    return mean_db, max_db


def is_effectively_silent_upload(data: bytes, _filename: str = "") -> bool:
    """
    True when decoded audio levels indicate near-silence (no practical speech).
    False when analysis fails or levels look like real speech.
    """
    mean_db, max_db = _ffmpeg_volume_db(data)
    if mean_db is None and max_db is None:
        return False
    if mean_db is not None and mean_db <= _MEAN_DB_SILENT_MAX:
        return True
    if max_db is not None and max_db <= _MAX_DB_SILENT_MAX:
        return True
    return False


def is_likely_silence_hallucination_transcript(text: str) -> bool:
    """
    True when the model probably invented text for silent / unusable audio.
    Conservative: only obvious STT junk phrases, not short but plausible emotion notes.
    """
    t = text.strip()
    if not t:
        return True
    if _SILENCE_HALLUCINATION_FULL.match(t):
        return True
    if _SUBTITLE_CREDIT_FULL.match(t):
        return True
    if _BRACKET_NOISE_FULL.match(t):
        return True
    lower = t.lower()
    if "amara.org" in lower or ("subscribe" in lower and len(t) < 100):
        return True
    return False


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
