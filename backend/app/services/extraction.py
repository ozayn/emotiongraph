"""
Log extraction from voice transcripts.

Multilingual support (English, Persian/Farsi, Serbian, and mixed/code-switched
speech across them): the LLM understands all listed languages, preserves the
speaker’s language(s) in free-text fields (event, comments, transcript_summary),
and maps structured fields into the fixed app schema without translating for
normalization.
"""

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
  "start_time", "end_time", "event", "energy_level", "anxiety", "contentment", "focus", "music", "comments"

Language (explicitly multilingual; robust to code-switching):
- Transcripts may be in English, Persian (Farsi), Serbian (Latin or Cyrillic script as transcribed), or any mix of these in the same utterance (code-switching). Interpret meaning across all of them; do not require English input.
- Speakers may switch languages mid-sentence or mid-story—follow the thread and merge related details into rows without dropping content because of language boundaries.
- For "event", "comments", and "transcript_summary": preserve the original language(s) exactly as expressed (English, Persian, Serbian, or natural mixed wording). Do not translate these fields into a single target language for normalization.
- Do not translate or rewrite the transcript; only extract and summarize in the source language(s).

Rules:
- Use null for any field you cannot infer with high confidence from the transcript.
- Prefer fewer, broader rows over guessing fine-grained times.
- start_time and end_time: strings "HH:MM" in 24-hour form using Western digits (0-9), e.g. "09:30" or "14:00", if mentioned; map from Persian/Arabic/Cyrillic digit forms if the transcript uses them; otherwise null.
- energy_level: integer 1 (low energy), 2 (neutral), or 3 (high energy) only if clearly stated (in any language); otherwise null.
- anxiety: integer 0 (not at all), 1 (a little), 2 (moderately), or 3 (very much); otherwise null.
- contentment: integer 1 (a little), 2 (moderately), or 3 (very much); otherwise null.
- focus: integer 1 (distracted) through 5 (deep focus): 1 distracted, 2 mostly distracted, 3 mixed, 4 mostly focused, 5 deep focus; otherwise null.
- music: map what the speaker said (any language) to one of exactly these English strings if clearly stated, otherwise null: "No", "Yes, upbeat", "Yes, calm", "Yes, other".
- event and comments are free text in the speaker’s language(s). Do not invent music or numeric ratings.
- Output must be valid JSON only, no markdown fences.
"""

SYSTEM_PROMPT = """You extract structured daily log rows from a voice transcript.
The transcript is explicitly multilingual: it may be English, Persian (Farsi), Serbian, or mixed—including frequent code-switching between these languages in one recording. Understand all of it; preserve the original language(s) in free-text fields (event, comments, transcript_summary); map structured fields to the fixed numeric scales and allowed music strings described in the user message.
Be conservative. Never fabricate specifics. Use null for unknown fields.
Do not translate the transcript or user-facing free text for uniformity—only extract and summarize in the source language(s), including natural mixed-language phrasing.
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

    Prompts assume transcripts may be English, Farsi, Serbian, or mixed/code-switched; response shape is unchanged.

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
