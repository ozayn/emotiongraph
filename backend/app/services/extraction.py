import json
import logging
import re

import anthropic
import httpx
from openai import OpenAI

from app.config import settings
from app.schemas import ExtractLogsResponse, LogRowBase

logger = logging.getLogger(__name__)


def extraction_service_configured() -> bool:
    """At least one of ANTHROPIC_API_KEY or GROQ_API_KEY is set (same notion as /extract-logs 503)."""
    return bool(settings.anthropic_api_key) or bool(settings.groq_api_key)


EXTRACTION_JSON_SCHEMA_HINT = """
Return a single JSON object with exactly these keys:
- "transcript_summary": string, a short neutral summary of what was said.
- "rows": array of objects. Each object may include only these keys (omit a key or use null if unknown):
  "start_time", "end_time", "event", "event_category", "energy_level", "anxiety",
  "contentment", "focus", "music", "comments"

Rules:
- Use null for any field you cannot infer with high confidence from the transcript.
- Prefer fewer, broader rows over guessing fine-grained times.
- start_time and end_time should be strings like "09:30" or "14:00" if mentioned; otherwise null.
- energy_level, anxiety, contentment, focus are integers 1-10 only if clearly stated; otherwise null.
- event is the main activity or feeling described; use null only if there is no usable line.
- Do not invent music or metrics.
- Output must be valid JSON only, no markdown fences.
"""

SYSTEM_PROMPT = """You extract structured daily log rows from a voice transcript.
Be conservative. Never fabricate specifics. Use null for unknown fields.
The user will review and edit before anything is saved."""


def _user_content(transcript: str, log_date_iso: str) -> str:
    return (
        f"log_date (context only, YYYY-MM-DD): {log_date_iso}\n\n"
        f"Transcript:\n{transcript}\n\n"
        f"{EXTRACTION_JSON_SCHEMA_HINT}"
    )


def _parse_extract_response(raw: str) -> ExtractLogsResponse:
    text = raw.strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
    if fence:
        text = fence.group(1).strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("root must be object")
    summary = data.get("transcript_summary")
    rows_raw = data.get("rows")
    if not isinstance(summary, str) or not isinstance(rows_raw, list):
        raise ValueError("invalid shape")
    rows: list[LogRowBase] = []
    for item in rows_raw:
        if not isinstance(item, dict):
            continue
        rows.append(LogRowBase.model_validate(item))
    return ExtractLogsResponse(transcript_summary=summary, rows=rows)


def _claude_raw_response(transcript: str, log_date_iso: str) -> str:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    timeout = httpx.Timeout(settings.anthropic_timeout_seconds, connect=15.0)
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=timeout)
    user_content = _user_content(transcript, log_date_iso)
    msg = client.messages.create(
        model=settings.anthropic_extraction_model,
        max_tokens=4096,
        temperature=0.2,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    parts: list[str] = []
    for block in msg.content:
        if block.type == "text":
            parts.append(block.text)
    raw = "".join(parts).strip()
    if not raw:
        raise RuntimeError("empty Claude response")
    return raw


def _groq_raw_response(transcript: str, log_date_iso: str) -> str:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    client = OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_openai_base_url,
    )
    user_content = _user_content(transcript, log_date_iso)
    completion = client.chat.completions.create(
        model=settings.groq_extraction_model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )
    choice = completion.choices[0].message.content
    if not choice:
        raise RuntimeError("empty Groq response")
    return choice


def extract_logs_from_transcript(transcript: str, log_date_iso: str) -> ExtractLogsResponse:
    """
    Provider order (enforced in this function only):

    1. If ANTHROPIC_API_KEY is set → call Claude first. If the call succeeds and
       _parse_extract_response accepts the output, return (log: anthropic).
    2. If Claude raises, times out, returns empty text, or parsing/validation fails →
       fall back to Groq only when GROQ_API_KEY is set (log: groq_fallback).
    3. If ANTHROPIC_API_KEY is missing and GROQ_API_KEY is set → Groq only (log: groq_only).
    4. If neither key is set → RuntimeError (caller maps to 503).

    Never writes to the database.
    """
    if not extraction_service_configured():
        raise RuntimeError("Configure ANTHROPIC_API_KEY and/or GROQ_API_KEY for extraction")

    use_anthropic = bool(settings.anthropic_api_key)
    use_groq = bool(settings.groq_api_key)
    claude_err: Exception | None = None

    # --- Primary: Anthropic / Claude ---
    if use_anthropic:
        try:
            raw = _claude_raw_response(transcript, log_date_iso)
            parsed = _parse_extract_response(raw)
            logger.info("extraction provider: anthropic")
            return parsed
        except Exception as e:
            claude_err = e
            if not use_groq:
                raise

    # --- Fallback (after Claude failure) or Groq-only ---
    if use_groq:
        try:
            raw = _groq_raw_response(transcript, log_date_iso)
            parsed = _parse_extract_response(raw)
            if claude_err is not None:
                logger.info("extraction provider: groq_fallback")
            else:
                logger.info("extraction provider: groq_only")
            return parsed
        except Exception as groq_err:
            if claude_err is not None:
                raise RuntimeError(
                    f"Claude failed ({claude_err}); Groq fallback failed ({groq_err})"
                ) from groq_err
            raise

    raise RuntimeError("Configure ANTHROPIC_API_KEY and/or GROQ_API_KEY for extraction")
