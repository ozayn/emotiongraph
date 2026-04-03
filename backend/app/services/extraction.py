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
  "start_time", "end_time", "event", "energy_level", "anxiety", "contentment", "focus", "anger", "music", "comments"
- Do not include "source_type" or any other keys in row objects.

Activity-only rows (critical):
- An action, activity, or event described on its own is enough for a valid row. You MUST still output a row when the speaker states what they did—even if they say nothing about mood, emotion, energy, focus, anxiety, contentment, anger, or music.
- Examples (English; same idea in Farsi, Serbian, and mixed speech): "I took a walk yesterday morning.", "Had lunch.", "Reviewed Slack.", "Went to the gym." → each deserves at least one row with a concise "event" in the speaker’s language; leave energy_level, anxiety, contentment, focus, anger, and music null unless the text explicitly supports them.
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
- Structured numeric fields are: energy_level, anxiety, contentment, focus, and optionally anger (secondary—see below). Emotions we do NOT model structurally (e.g. jealousy, shame, grief without a clear fit) stay in "comments" and/or "transcript_summary" only—never coerce them into these five.

- energy_level (1 low … 3 high): use only when the text clearly refers to physical energy, alertness, fatigue, exhaustion, or vitality—not general mood or emotional arousal alone.

- anxiety (0–3): use only when the text clearly refers to worry, nervousness, unease, dread, feeling anxious, or on-edge about outcomes—NOT for anger, frustration, or feeling mad alone. Phrases like "a little angry", "pissed off", "furious", "irritated" (and close equivalents in any language) must NOT set anxiety unless separate clear anxiety/worry language is also present.

- contentment (1–3): satisfaction, peace, relief, glad, feeling better about how things are—when the wording is about mood or life satisfaction, not physical vitality. Do not use contentment as a proxy for anger.

- focus (1–5): attention, concentration, distractibility—only when clearly supported; otherwise null.

- anger (0–3, secondary field): same numeric scale as anxiety (0 = not at all … 3 = very much) but ONLY for clear anger / mad / furious / rage / resentment / strong irritation framed as anger—not for worry, not as a substitute for anxiety. Never set anxiety from an anger-only statement; never set anger from worry-only language. If both anger and anxiety are clearly expressed, you may set both appropriately. If intensity is vague ("upset" without clear axis), prefer null for anger and anxiety and keep nuance in "comments". When in doubt, null.

Rules:
- Use null for any field you cannot infer with high confidence from the transcript. Do not invent times, ratings, or emotions. An activity-only row is valid with "event" set and all numeric or music fields null.
- Prefer fewer, broader rows over guessing fine-grained times. Split into multiple rows only when the transcript clearly describes distinct time-bounded episodes or clearly separable situations.
- start_time and end_time: strings "HH:MM" in 24-hour form using Western digits (0-9), e.g. "09:30" or "14:00", if mentioned; map from Persian/Arabic/Cyrillic digit forms if the transcript uses them; otherwise null.
- energy_level: integer 1 (low energy), 2 (neutral), or 3 (high energy) only if clearly stated (in any language); otherwise null. Follow the "Affect mapping" section above—do not use this field for unsupported emotions.
- anxiety: integer 0 (not at all), 1 (a little), 2 (moderately), or 3 (very much); otherwise null. Never use anxiety for anger-only statements.
- contentment: integer 1 (a little), 2 (moderately), or 3 (very much); otherwise null. Never use contentment as a proxy for unsupported emotions.
- focus: integer 1 (distracted) through 5 (deep focus): 1 distracted, 2 mostly distracted, 3 mixed, 4 mostly focused, 5 deep focus; otherwise null.
- anger: integer 0 (not at all), 1 (a little), 2 (moderately), or 3 (very much); otherwise null. Optional secondary field—only when anger is clearly expressed per "Affect mapping"; never infer from activity type alone.
- music: map what the speaker said (any language) to one of exactly these English strings if clearly stated, otherwise null: "No", "Yes, upbeat", "Yes, calm", "Yes, other".
- Do not invent music or numeric ratings.
- Output must be valid JSON only, no markdown fences.
"""

PRESENT_TIMING_HINT = """
capture_time_local (submission wall clock, "HH:MM", Western digits) is optional context. It is NOT the time of past memories, habits, or vague routines unless the rules below are satisfied.
When user_timezone (IANA) is provided, treat log_date as that calendar date in that timezone and capture_time_local as wall clock in that same timezone—not UTC unless the zone is Etc/UTC.

**This input is typed text (not a live voice capture).** Be conservative with capture_time_local.

Use start_time = capture_time_local for a row ONLY when ALL hold:
  (1) The transcript clearly signals the present moment, something immediate/imminent, or an **immediate-recent** state tied to now (e.g. just waking)—not a remembered distant story. Qualifying cues (any language, natural equivalents): English "now", "right now", "currently", "at the moment", "at this moment", "as of now", "about to", "going now", "starting now", "heading to", "on my way"; **present activity / task** describing what the speaker is doing at submission time: "I'm coding", "I am coding", "I'm working on …", "I am working on …" (contrast past "I was coding / I was working on"); **immediate morning / wake**: "just woke up", "just woken up", "just got up", "just got out of bed", "just rolled out of bed"; **present emotional check-in** phrased as current state, e.g. "I'm feeling …", "I am feeling …", or "I feel …" when describing mood now — but NOT "I feel that …" narrating a past belief; **present progressive** tied to now, e.g. "I'm …ing now", "… and feeling …" when the clause is clearly about the current moment (often together with "currently" / "right now"); typed or recorded check-ins e.g. "as I'm typing", "as I type", "in this recording", "on this recording"; Serbian e.g. "sada", "trenutno", "upravo", "idem na …"; Persian e.g. "الان", "دارم میرم …", "همین الان".
  (2) The passage is not framed as habitual or generic: if the speaker uses "usually", "often", "typically", "generally", or close equivalents (e.g. "معمولا", "обично", "često"), do NOT anchor to capture_time_local unless a separate clearly present-tense segment also qualifies that row.
  (3) The row is not about a recalled interval with its own stated or implied past timing.
  (4) No explicit clock time in the text applies to that row (if it does, use that time or null, not capture_time_local).

If you use capture_time_local as start_time for a row, set end_time to null. Never infer end_time from capture_time_local.

If capture_time_local is absent, do not invent clock times from "now" alone; use null unless the text states a time clearly.

When in doubt between a **distant memory** and a **present or immediate-recent** check-in, leave start_time null instead of using capture_time_local—but phrases like "just woke up" / "just got up" are immediate-recent and usually qualify.
"""

VOICE_CAPTURE_TIMING_HINT = """
capture_time_local is the wall-clock time when this **live voice recording** was submitted (same calendar date as log_date in user_timezone).

**Explicit clock times in the transcript always win.** Map any stated time (including non-Western digits) to start_time/end_time; never replace those with capture_time_local.

**Live voice default (no explicit time):** The speaker is recording **now**. For short present-moment activity notes (e.g. naming what they are doing without a clock time), set start_time = capture_time_local and end_time = null unless the text gives an explicit end time. This applies to plain activity phrases that read as **current** (e.g. "having a cigarette", "on a walk", "in a meeting") when there is no retrospective framing.

**Do NOT use capture_time_local** when the narrative is clearly about **the past** or a **remembered** episode (not the recording moment). Treat these as retrospective (including natural equivalents in Persian, Serbian, and English): "yesterday", "last night", "this morning" when recounting earlier events, "earlier", "earlier today", "ago", "last week", "previously", "back then"; past-tense recounts like "I had …" / "I was …" describing a **completed** earlier situation (contrast with present progressive "I'm having …" for something happening now); Persian e.g. دیروز (yesterday), دیشب (last night); Serbian e.g. juče, sinoć, jutros, ranije when clearly past.

**Habitual / generic:** "usually", "often", "typically", "generally" (معمولا، обично, često, …) — do NOT use capture_time_local unless a separate segment clearly describes the present recording moment.

**Several distinct past episodes** without clock times: prefer null start_time per row rather than stamping every row with capture_time_local.

If you use capture_time_local as start_time, set end_time to null unless the text explicitly gives an end time.
"""

SYSTEM_PROMPT = """You extract structured daily log data from spoken or written narrative text (voice transcripts or typed notes).
The input may be English, Persian (Farsi), Serbian, or mixed—including code-switching. Understand all of it. Put cycle/sleep day metadata in day_context, not rows. Use rows for activities, actions, events, timed or situational episodes, and justified present-state check-ins—even when the speaker only says what they did and mentions no feelings or metrics.
Preserve the speaker’s original language(s) in "event" and "comments" naturally; do not normalize mixed speech into awkward single-language paraphrases. transcript_summary is optional flavor—accuracy of rows and day_context matters more.
Be conservative. Never fabricate emotions, scores, or clock times. Use null for unknown fields; metrics are optional and must not be inferred from activity type alone.

Structured affect (critical): Fill energy_level, anxiety, contentment, and focus only when wording clearly matches each scale (see user message). You may also fill optional secondary field "anger" when anger is clearly expressed—use a separate 0–3 scale; never treat anger as anxiety or vice versa. Other emotions we do not model structurally belong in "comments" / transcript_summary only.
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


def _is_proper_hhmm(value: str | None) -> bool:
    if not value or not isinstance(value, str):
        return False
    return bool(re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", value.strip()))


def _transcript_suggests_retrospective(text: str) -> bool:
    """
    True when the transcript is plausibly about the past / remembered events, so we should not
    default start_time to the recording clock. Multilingual (EN + common FA/SR cues).
    """
    if not text or not text.strip():
        return False
    lower = text.lower()

    ascii_patterns = (
        r"\byesterday\b",
        r"\byesterday\s+morning\b",
        r"\blast night\b",
        r"\bthis morning\b",
        r"\bearlier today\b",
        r"\bearlier\b",
        r"\bago\b",
        r"\blast week\b",
        r"\blast month\b",
        r"\bpreviously\b",
        r"\bback then\b",
    )
    for pat in ascii_patterns:
        if re.search(pat, lower):
            return True

    # "I had …" past recount — exclude "I had to" (obligation) and "I had a great time" still matches;
    # "I had a cigarette" (past) should match. Require "i had" not followed by "to".
    if re.search(r"\bi had\b(?! to\b)", lower):
        return True

    for frag in (
        "دیروز",
        "دیشب",
        "پارسال",
        "قبلاً",
        "قبلا",
        "صبح امروز",
    ):
        if frag in text:
            return True

    for frag in ("juče", "sinoć", "sinoc", "jutros", "ranije", "prekjuče", "prekjuce"):
        if frag in lower:
            return True

    return False


def _remove_capture_start_time(rows: list[ExtractLogsRow], cap: str) -> list[ExtractLogsRow]:
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


def _transcript_suggests_habitual_framing(text: str) -> bool:
    """True when the note is framed as a habit or generalization (do not anchor to capture clock)."""
    if not text or not text.strip():
        return False
    lower = text.lower()
    if re.search(r"\busually\b|\boften\b|\btypically\b|\bgenerally\b|\bmost\s+of\s+the\s+time\b", lower):
        return True
    for frag in ("معمولا", "обично", "često", "cesto"):
        if frag in lower or frag in text:
            return True
    return False


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
        "at this moment",
        "as of now",
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
    # Present activity at submission time (exclude "i was …" past forms).
    if re.search(r"\bi'?m\s+coding\b", lower) or re.search(r"\bi\s+am\s+coding\b", lower):
        return True
    if re.search(r"\bi'?m\s+working\s+on\b", lower) or re.search(r"\bi\s+am\s+working\s+on\b", lower):
        return True
    if re.search(r"\bim\s+working\s+on\b", lower):
        return True
    if re.search(r"\bi'?m\s+feeling\b", lower) or re.search(r"\bi\s+am\s+feeling\b", lower):
        return True
    # Broad present-progressive check-ins: "I'm talking to …", "I'm having dinner", "I'm eating", etc.
    # Skip when the same note reads as habitual (usually/often/…) — conservative.
    progressive = (
        re.search(r"\bi'?m\s+[a-z]{2,}ing\b", lower)
        or re.search(r"\bi\s+am\s+[a-z]{2,}ing\b", lower)
        or re.search(r"\bim\s+[a-z]{2,}ing\b", lower)
    )
    if progressive and not _transcript_suggests_habitual_framing(text):
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
    capture_kind: str,
) -> list[ExtractLogsRow]:
    """
    Remove start_time when it equals capture_time_local but the transcript does not justify it.

    - **text**: keep previous behavior (strip unless present/imminent anchor markers).
    - **voice**: do not strip for present-moment notes; strip when retrospective cues suggest the
      model wrongly anchored a past narrative to the recording clock.
    """
    if not capture_time_local:
        return rows
    cap = _normalize_hhmm(capture_time_local)
    if not cap:
        return rows

    if capture_kind == "voice":
        if _transcript_suggests_retrospective(transcript):
            return _remove_capture_start_time(rows, cap)
        return rows

    if _transcript_allows_capture_time_anchor(transcript):
        return rows
    return _remove_capture_start_time(rows, cap)


def _maybe_fill_voice_default_start_time(
    rows: list[ExtractLogsRow],
    transcript: str,
    capture_time_local: str | None,
    capture_kind: str,
) -> list[ExtractLogsRow]:
    """
    For a single extracted row with no proper HH:MM start_time, stamp recording time (voice only).
    Skipped for retrospective transcripts and for typed text.
    """
    if capture_kind != "voice" or not capture_time_local:
        return rows
    if _transcript_suggests_retrospective(transcript):
        return rows
    cap = _normalize_hhmm(capture_time_local)
    if not cap or not re.match(r"^\d{2}:\d{2}$", cap):
        return rows
    if len(rows) != 1:
        return rows
    row = rows[0]
    if _is_proper_hhmm(row.start_time):
        return rows
    if row.end_time is not None and str(row.end_time).strip():
        return rows
    return [row.model_copy(update={"start_time": cap})]


def _maybe_fill_text_present_start_time(
    rows: list[ExtractLogsRow],
    transcript: str,
    capture_time_local: str | None,
    capture_kind: str,
) -> list[ExtractLogsRow]:
    """
    Typed text: when the transcript clearly anchors to the present and the model left start_time
    empty, stamp capture_time_local for a single row (same conservative shape as voice fill).
    Explicit times in the row are never overwritten.
    """
    if capture_kind != "text" or not capture_time_local:
        return rows
    if not _transcript_allows_capture_time_anchor(transcript):
        return rows
    if _transcript_suggests_retrospective(transcript):
        return rows
    cap = _normalize_hhmm(capture_time_local)
    if not cap or not re.match(r"^\d{2}:\d{2}$", cap):
        return rows
    if len(rows) != 1:
        return rows
    row = rows[0]
    if _is_proper_hhmm(row.start_time):
        return rows
    if row.end_time is not None and str(row.end_time).strip():
        return rows
    return [row.model_copy(update={"start_time": cap})]


def _postprocess_extraction(
    result: ExtractLogsResponse,
    transcript: str,
    capture_time_local: str | None,
    capture_kind: str,
) -> ExtractLogsResponse:
    rows = result.rows
    rows = _maybe_strip_capture_time_rows(rows, transcript, capture_time_local, capture_kind)
    rows = _maybe_fill_voice_default_start_time(rows, transcript, capture_time_local, capture_kind)
    rows = _maybe_fill_text_present_start_time(rows, transcript, capture_time_local, capture_kind)
    if rows is result.rows:
        return result
    return result.model_copy(update={"rows": rows})


def _user_content(
    transcript: str,
    log_date_iso: str,
    capture_time_local: str | None,
    user_timezone: str | None,
    capture_kind: str,
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
    kind_line = f"capture_kind: {capture_kind} (voice = live recording path; text = typed notes — follow the timing rules for this kind only)\n\n"
    timing_hint = VOICE_CAPTURE_TIMING_HINT if capture_kind == "voice" else PRESENT_TIMING_HINT
    return (
        f"log_date (context only, YYYY-MM-DD): {log_date_iso}\n\n"
        f"{tz_line}"
        f"{cap_line}"
        f"{kind_line}"
        f"Transcript:\n{transcript}\n\n"
        f"{timing_hint}\n"
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
    capture_kind: str,
) -> str:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    timeout = httpx.Timeout(settings.anthropic_timeout_seconds, connect=15.0)
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=timeout)
    user_content = _user_content(transcript, log_date_iso, capture_time_local, user_timezone, capture_kind)
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
    capture_kind: str,
) -> str:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    client = OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_openai_base_url,
    )
    user_content = _user_content(transcript, log_date_iso, capture_time_local, user_timezone, capture_kind)
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
    capture_kind: str = "text",
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

    ck = capture_kind if capture_kind in ("voice", "text") else "text"

    use_anthropic = bool(settings.anthropic_api_key)
    use_groq = bool(settings.groq_api_key)
    claude_err: Exception | None = None

    # --- Primary: Anthropic / Claude ---
    if use_anthropic:
        try:
            raw = _claude_raw_response(transcript, log_date_iso, capture_time_local, user_timezone, ck)
            parsed = _postprocess_extraction(
                _parse_extract_response(raw),
                transcript,
                capture_time_local,
                ck,
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
            raw = _groq_raw_response(transcript, log_date_iso, capture_time_local, user_timezone, ck)
            parsed = _postprocess_extraction(
                _parse_extract_response(raw),
                transcript,
                capture_time_local,
                ck,
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
