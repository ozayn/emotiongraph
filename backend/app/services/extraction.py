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
from app.schemas import ExtractDayContext, ExtractLogsResponse, ExtractLogsRow

logger = logging.getLogger(__name__)


def extraction_service_configured() -> bool:
    """At least one of ANTHROPIC_API_KEY or GROQ_API_KEY is set (same notion as /extract-logs 503)."""
    return bool(settings.anthropic_api_key) or bool(settings.groq_api_key)


EXTRACTION_JSON_SCHEMA_HINT = """
Return a single JSON object with exactly these keys:
- "transcript_summary": string, optional brief neutral recap. Lower priority than accurate rows and day_context; keep it short. Prefer the same language mix as the transcript (do not force full translation into one language).
- "day_context": optional object for whole-day facts that are NOT timed activities. Include only when clearly stated; otherwise omit the key or set fields to null. Keys (all optional): "cycle_day" (integer 1–366 menstrual/tracking day), "sleep_hours" (number 0–24), "sleep_quality" (integer 1–5). Never put cycle day, sleep duration, or sleep quality into "rows" as if they were events—only here.
- "rows": array of objects for discrete activities, intervals, or present-state check-ins with situational context. Each object may include only these keys (omit a key or use null if unknown):
  "start_time", "end_time", "event", "energy_level", "anxiety", "contentment", "focus", "music", "comments"
- Do not include "source_type" or any other keys in row objects.

Activity-only rows (critical):
- An action, activity, or event described on its own is enough for a valid row. You MUST still output a row when the speaker states what they did—even if they say nothing about mood, emotion, energy, focus, anxiety, contentment, or music.
- Examples (English; same idea in Farsi, Serbian, and mixed speech): "I took a walk yesterday morning.", "Had lunch.", "Reviewed Slack.", "Went to the gym." → each deserves at least one row with a concise "event" in the speaker’s language; leave energy_level, anxiety, contentment, focus, and music null unless the text explicitly supports them.
- Never skip or omit a row solely because no metrics or feelings were mentioned. Never fill metrics by guessing from the type of activity (e.g. do not assume anxiety or energy from "gym" or "meeting").

Day-level vs rows (critical):
- Cycle day (e.g. "cycle day 13"), how many hours slept, and sleep quality/poor sleep are day_context only. Do not create rows whose main purpose is only to record those facts.
- Rows are for activities, meetings, work blocks, moods tied to a situation, or clear present-moment states—not for standalone sleep/cycle metadata.

Language (explicitly multilingual; robust to code-switching):
- Transcripts may be in English, Persian (Farsi), Serbian (Latin or Cyrillic script as transcribed), or any mix of these in the same utterance (code-switching). Interpret meaning across all of them; do not require English input.
- Speakers may switch languages mid-sentence or mid-story—follow the thread and merge related details into rows without dropping content because of language boundaries.
- For "event" and "comments": preserve the speaker’s original language(s) and natural phrasing. Do not merge languages into awkward hybrids unless the speaker did. Do not translate for normalization.
- "transcript_summary" is secondary; keep it concise and faithful to the source language(s) when possible.

Event vs comments (critical):
- "event": a short, human-readable label for what was going on (a few words to a short phrase in the speaker’s language). Never paste the full narrative sentence into "event".
- Put emotional arcs, nuance, secondary details, and mixed feelings in "comments", not in a bloated "event".

Affect mapping (conservative):
- energy_level, anxiety, contentment, and focus are NEVER required. Omit them or use null whenever the transcript does not clearly state them—this includes pure activity descriptions with no affect or rating language.
- energy_level (1 low … 3 high): use only when the text clearly refers to physical energy, alertness, fatigue, exhaustion, or vitality—not general mood or happiness.
- contentment / relief / feeling better / lighter / at peace / glad things improved: map to "contentment" first when the wording is about mood or satisfaction, not energy. If both energy and mood are explicit, set both scales appropriately; otherwise prefer the scale that matches the wording.
- anxiety and focus: only when clearly supported; otherwise null.

Rules:
- Use null for any field you cannot infer with high confidence from the transcript. Do not invent times, ratings, or emotions. An activity-only row is valid with "event" set and all numeric or music fields null.
- Prefer fewer, broader rows over guessing fine-grained times. Split into multiple rows only when the transcript clearly describes distinct time-bounded episodes or clearly separable situations.
- start_time and end_time: strings "HH:MM" in 24-hour form using Western digits (0-9), e.g. "09:30" or "14:00", if mentioned; map from Persian/Arabic/Cyrillic digit forms if the transcript uses them; otherwise null.
- energy_level: integer 1 (low energy), 2 (neutral), or 3 (high energy) only if clearly stated (in any language); otherwise null.
- anxiety: integer 0 (not at all), 1 (a little), 2 (moderately), or 3 (very much); otherwise null.
- contentment: integer 1 (a little), 2 (moderately), or 3 (very much); otherwise null.
- focus: integer 1 (distracted) through 5 (deep focus): 1 distracted, 2 mostly distracted, 3 mixed, 4 mostly focused, 5 deep focus; otherwise null.
- music: map what the speaker said (any language) to one of exactly these English strings if clearly stated, otherwise null: "No", "Yes, upbeat", "Yes, calm", "Yes, other".
- Do not invent music or numeric ratings.
- Output must be valid JSON only, no markdown fences.
"""

PRESENT_TIMING_HINT = """
capture_time_local (submission wall clock, "HH:MM", Western digits) is optional context. It is NOT the time of past memories, habits, or vague routines unless the rules below are satisfied.
When user_timezone (IANA) is provided, treat log_date as that calendar date in that timezone and capture_time_local as wall clock in that same timezone—not UTC unless the zone is Etc/UTC.

Use start_time = capture_time_local for a row ONLY when ALL hold:
  (1) The transcript clearly signals the present moment, something immediate/imminent, or an **immediate-recent** state tied to now (e.g. just waking)—not a remembered distant story. Qualifying cues (any language, natural equivalents): English "now", "right now", "currently", "at the moment", "about to", "going now", "starting now", "heading to", "on my way"; **immediate morning / wake**: "just woke up", "just woken up", "just got up", "just got out of bed", "just rolled out of bed"; **present emotional check-in** phrased as current state, e.g. "I'm feeling …", "I am feeling …", or "I feel …" when describing mood now — but NOT "I feel that …" narrating a past belief; typed or recorded check-ins e.g. "as I'm typing", "as I type", "in this recording", "on this recording"; Serbian e.g. "sada", "trenutno", "upravo", "idem na …"; Persian e.g. "الان", "دارم میرم …", "همین الان".
  (2) The passage is not framed as habitual or generic: if the speaker uses "usually", "often", "typically", "generally", or close equivalents (e.g. "معمولا", "обично", "često"), do NOT anchor to capture_time_local unless a separate clearly present-tense segment also qualifies that row.
  (3) The row is not about a recalled interval with its own stated or implied past timing.
  (4) No explicit clock time in the text applies to that row (if it does, use that time or null, not capture_time_local).

If you use capture_time_local as start_time for a row, set end_time to null. Never infer end_time from capture_time_local.

If capture_time_local is absent, do not invent clock times from "now" alone; use null unless the text states a time clearly.

When in doubt between a **distant memory** and a **present or immediate-recent** check-in, leave start_time null instead of using capture_time_local—but phrases like "just woke up" / "just got up" are immediate-recent and usually qualify.
"""

SYSTEM_PROMPT = """You extract structured daily log data from spoken or written narrative text (voice transcripts or typed notes).
The input may be English, Persian (Farsi), Serbian, or mixed—including code-switching. Understand all of it. Put cycle/sleep day metadata in day_context, not rows. Use rows for activities, actions, events, timed or situational episodes, and justified present-state check-ins—even when the speaker only says what they did and mentions no feelings or metrics.
Preserve the speaker’s original language(s) in "event" and "comments" naturally; do not normalize mixed speech into awkward single-language paraphrases. transcript_summary is optional flavor—accuracy of rows and day_context matters more.
Be conservative. Never fabricate emotions, scores, or clock times. Use null for unknown fields; metrics are optional and must not be inferred from activity type alone.
The user will review and edit before anything is saved.
Do not output source_type on rows; only the schema keys listed in the user message."""


def _normalize_hhmm(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    m = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", s)
    if not m:
        return s
    h, mm = int(m.group(1)), m.group(2)
    return f"{h:02d}:{mm}"


def _transcript_allows_capture_time_anchor(text: str) -> bool:
    """
    True when the transcript clearly signals present or imminent experience (not only past/habitual).
    Used to drop over-aggressive start_time == capture_time_local after model output.
    """
    if not text or not text.strip():
        return False
    lower = text.lower()
    ascii_markers = (
        "right now",
        "currently",
        "at the moment",
        "about to",
        "starting now",
        "going now",
        "presently",
        "as we speak",
        "this moment",
        "at present",
        "as i'm typing",
        "as i type",
        "in this recording",
        "on this recording",
        "i'm going to",
        "im going to",
        "i am going to",
        "going to a meeting",
        "going to the meeting",
        "going to a ",
        "going to the ",
        "heading to",
        "on my way",
        "just woke up",
        "just woken up",
        "just got up",
        "just woke",
        "just got out of bed",
        "just rolled out of bed",
    )
    if any(m in lower for m in ascii_markers):
        return True
    if re.search(r"\bi'?m\s+feeling\b", lower) or re.search(r"\bi\s+am\s+feeling\b", lower):
        return True
    if re.search(r"\bi feel\s+(?!that\b)", lower):
        return True
    if re.search(r"\bjust\s+(woke|gotten\s+up|got\s+up|woken)\b", lower):
        return True
    if re.search(r"(?:^|[\s,.;:!?\"'(\[\{])now(?:[\s,.;:!?\"')\]\}]|$)", lower):
        return True
    if re.search(r"\bsada\b", lower) or re.search(r"\btrenutno\b", lower) or re.search(r"\bupravo\b", lower):
        return True
    if "idem na" in lower:
        return True
    for frag in ("الان", "دارم میرم", "همین الان", "هم اکنون", "همین لحظه"):
        if frag in text:
            return True
    return False


def _maybe_strip_capture_time_rows(
    rows: list[ExtractLogsRow],
    transcript: str,
    capture_time_local: str | None,
) -> list[ExtractLogsRow]:
    """If the transcript does not justify anchoring to capture_time_local, clear matching start_time."""
    if not capture_time_local:
        return rows
    cap = _normalize_hhmm(capture_time_local)
    if not cap:
        return rows
    if _transcript_allows_capture_time_anchor(transcript):
        return rows
    out: list[ExtractLogsRow] = []
    changed = False
    for row in rows:
        st = _normalize_hhmm(row.start_time)
        if st == cap:
            out.append(row.model_copy(update={"start_time": None}))
            changed = True
        else:
            out.append(row)
    return out if changed else rows


def _postprocess_extraction(
    result: ExtractLogsResponse,
    transcript: str,
    capture_time_local: str | None,
) -> ExtractLogsResponse:
    new_rows = _maybe_strip_capture_time_rows(result.rows, transcript, capture_time_local)
    if new_rows is result.rows:
        return result
    return result.model_copy(update={"rows": new_rows})


def _user_content(
    transcript: str,
    log_date_iso: str,
    capture_time_local: str | None,
    user_timezone: str | None,
) -> str:
    cap_line = (
        f"capture_time_local (user's local wall clock when they submitted, HH:MM): {capture_time_local}\n\n"
        if capture_time_local
        else "capture_time_local: (not provided)\n\n"
    )
    tz_line = (
        f"user_timezone (IANA): {user_timezone}\n\n"
        if user_timezone
        else "user_timezone: (not provided — treat log_date and capture times as context-only strings)\n\n"
    )
    return (
        f"log_date (context only, YYYY-MM-DD): {log_date_iso}\n\n"
        f"{tz_line}"
        f"{cap_line}"
        f"Transcript:\n{transcript}\n\n"
        f"{PRESENT_TIMING_HINT}\n"
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
    rows: list[ExtractLogsRow] = []
    for item in rows_raw:
        if not isinstance(item, dict):
            continue
        clean = {k: v for k, v in item.items() if k != "source_type"}
        rows.append(ExtractLogsRow.model_validate(clean))

    day_context: ExtractDayContext | None = None
    day_raw = data.get("day_context")
    if isinstance(day_raw, dict):
        try:
            dc = ExtractDayContext.model_validate(day_raw)
            if dc.cycle_day is not None or dc.sleep_hours is not None or dc.sleep_quality is not None:
                day_context = dc
        except Exception:
            day_context = None

    return ExtractLogsResponse(transcript_summary=summary, rows=rows, day_context=day_context)


def _claude_raw_response(
    transcript: str,
    log_date_iso: str,
    capture_time_local: str | None,
    user_timezone: str | None,
) -> str:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    timeout = httpx.Timeout(settings.anthropic_timeout_seconds, connect=15.0)
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=timeout)
    user_content = _user_content(transcript, log_date_iso, capture_time_local, user_timezone)
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


def _groq_raw_response(
    transcript: str,
    log_date_iso: str,
    capture_time_local: str | None,
    user_timezone: str | None,
) -> str:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    client = OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_openai_base_url,
    )
    user_content = _user_content(transcript, log_date_iso, capture_time_local, user_timezone)
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


def extract_logs_from_transcript(
    transcript: str,
    log_date_iso: str,
    capture_time_local: str | None = None,
    user_timezone: str | None = None,
) -> ExtractLogsResponse:
    """
    Provider order (enforced in this function only):

    1. If ANTHROPIC_API_KEY is set → call Claude first. If the call succeeds and
       _parse_extract_response accepts the output, return (log: anthropic).
    2. If Claude raises, times out, returns empty text, or parsing/validation fails →
       fall back to Groq only when GROQ_API_KEY is set (log: groq_fallback).
    3. If ANTHROPIC_API_KEY is missing and GROQ_API_KEY is set → Groq only (log: groq_only).
    4. If neither key is set → RuntimeError (caller maps to 503).

    Prompts assume transcripts may be English, Farsi, Serbian, or mixed/code-switched.
    Response includes optional ``day_context`` (cycle/sleep fields) plus ``rows`` and ``transcript_summary``.

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
            raw = _claude_raw_response(transcript, log_date_iso, capture_time_local, user_timezone)
            parsed = _postprocess_extraction(
                _parse_extract_response(raw),
                transcript,
                capture_time_local,
            )
            logger.info("extraction provider: anthropic")
            return parsed
        except Exception as e:
            claude_err = e
            if not use_groq:
                raise

    # --- Fallback (after Claude failure) or Groq-only ---
    if use_groq:
        try:
            raw = _groq_raw_response(transcript, log_date_iso, capture_time_local, user_timezone)
            parsed = _postprocess_extraction(
                _parse_extract_response(raw),
                transcript,
                capture_time_local,
            )
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
