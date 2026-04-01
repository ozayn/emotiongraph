import json
import re

from openai import OpenAI

from app.config import settings
from app.schemas import ExtractLogsResponse, LogRowBase

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


def _extraction_client_and_model() -> tuple[OpenAI, str]:
    """Prefer OpenAI when configured; otherwise Groq (same key as transcription)."""
    if settings.openai_api_key:
        return OpenAI(api_key=settings.openai_api_key), settings.openai_extraction_model
    if settings.groq_api_key:
        return (
            OpenAI(
                api_key=settings.groq_api_key,
                base_url=settings.groq_openai_base_url,
            ),
            settings.groq_extraction_model,
        )
    raise RuntimeError("Configure OPENAI_API_KEY or GROQ_API_KEY for extraction")


def extract_logs_from_transcript(transcript: str, log_date_iso: str) -> ExtractLogsResponse:
    client, model = _extraction_client_and_model()
    user_content = (
        f"log_date (context only, YYYY-MM-DD): {log_date_iso}\n\n"
        f"Transcript:\n{transcript}\n\n"
        f"{EXTRACTION_JSON_SCHEMA_HINT}"
    )
    completion = client.chat.completions.create(
        model=model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )
    choice = completion.choices[0].message.content
    if not choice:
        raise RuntimeError("empty model response")
    return _parse_extract_response(choice)
