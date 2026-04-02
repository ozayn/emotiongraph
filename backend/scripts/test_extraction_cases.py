#!/usr/bin/env python3
"""
Developer harness: run many natural-language reports through /extract-logs and save JSON artifacts.

How to run
----------
1. Start the API locally (e.g. ``./scripts/run_local.sh`` or uvicorn) with extraction keys set.
2. From the ``backend`` directory::

       python scripts/test_extraction_cases.py

   Outputs are written under ``./extraction_test_outputs/`` (override with
   ``EMOTIONGRAPH_EXTRACTION_TEST_OUT``): one ``{case_id}.json`` per case,
   ``all_cases.json`` (full run bundle), and ``summary.json``.

Environment (optional)
----------------------
EMOTIONGRAPH_API_BASE              API origin (default: http://127.0.0.1:8100)
EMOTIONGRAPH_LOG_DATE              YYYY-MM-DD for requests (default: 2026-04-01)
EMOTIONGRAPH_CAPTURE_TIME_LOCAL    HH:MM sent as capture_time_local (default: 14:30).
                                   Set to ``omit`` to leave capture_time_local out of the payload.
EMOTIONGRAPH_CAPTURE_KIND          ``voice`` or ``text`` (default: text). Per-case ``capture_kind`` overrides.
EMOTIONGRAPH_EXTRACTION_TEST_OUT   Output directory (default: extraction_test_outputs)

Note: ``/extract-logs`` does not require ``X-User-Id``; this script only exercises extraction.

Extend cases by appending dicts to ``TEST_CASES`` (keys: case_id, input_text, notes).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE = os.environ.get("EMOTIONGRAPH_API_BASE", "http://127.0.0.1:8100").rstrip("/")
LOG_DATE = os.environ.get("EMOTIONGRAPH_LOG_DATE", "2026-04-01")

_cap_raw = os.environ.get("EMOTIONGRAPH_CAPTURE_TIME_LOCAL", "14:30").strip()
if _cap_raw.lower() == "omit":
    CAPTURE_TIME_LOCAL: str | None = None
else:
    CAPTURE_TIME_LOCAL = _cap_raw or None

_out = os.environ.get("EMOTIONGRAPH_EXTRACTION_TEST_OUT", "extraction_test_outputs")
OUTPUT_DIR = Path(_out).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EXTRACT_TIMEOUT = float(os.environ.get("EMOTIONGRAPH_EXTRACT_TIMEOUT", "120"))

_ck = os.environ.get("EMOTIONGRAPH_CAPTURE_KIND", "text").strip().lower()
DEFAULT_CAPTURE_KIND = _ck if _ck in ("voice", "text") else "text"

# ---------------------------------------------------------------------------
# Test cases: extend this list for new scenarios
# ---------------------------------------------------------------------------

TEST_CASES: list[dict[str, str]] = [
    {
        "case_id": "voice_short_activity_cigarette",
        "input_text": "having a cigarette",
        "notes": "Voice capture_kind; single-row utterance should get start_time from capture_time_local (model + post-process).",
        "capture_kind": "voice",
    },
    {
        "case_id": "present_meeting_anxiety",
        "input_text": "I'm going to a meeting and I am very anxious.",
        "notes": "Present / imminent; may use capture_time_local for start_time if model agrees.",
    },
    {
        "case_id": "happening_now_energy_english",
        "input_text": "Right now I'm drained and can barely focus; anxiety is pretty high.",
        "notes": "Happening-now English; no explicit clock time.",
    },
    {
        "case_id": "just_woke_up_capture_anchor",
        "input_text": "I just woke up, still groggy.",
        "notes": "Immediate-recent wake; capture_time_local as start_time should not be stripped post-process.",
    },
    {
        "case_id": "single_work_block",
        "input_text": "From 9 to 11 I worked on the report. I felt mostly focused, only a little anxious, and my energy was neutral.",
        "notes": "Single row; explicit times; metrics in prose.",
    },
    {
        "case_id": "two_blocks_same_note",
        "input_text": "From 8 to 9 I reviewed Slack and felt distracted. Then from 9 to 11 I worked deeply on the report and felt much better.",
        "notes": "Two temporal blocks; expect two rows.",
    },
    {
        "case_id": "english_three_events_paragraph",
        "input_text": "Walked the dog around 7. After breakfast I answered email until 9:30. The rest of the morning was one long meeting until noon and I was exhausted.",
        "notes": "Multiple events in one paragraph; fuzzy and explicit times mixed.",
    },
    {
        "case_id": "single_clear_event_minimal",
        "input_text": "Therapy at 4. Left feeling lighter.",
        "notes": "Minimal single event; one time anchor.",
    },
    {
        "case_id": "no_time_afternoon",
        "input_text": "I spent part of the afternoon reviewing updates and felt anxious and a bit overwhelmed.",
        "notes": "Vague afternoon; should not invent exact times unless present-tense rules apply.",
    },
    {
        "case_id": "day_context_plus_entry_english",
        "input_text": "Cycle day 13. Slept about 6 hours and sleep was poor. From 10 to 12 I had a difficult meeting and felt stressed.",
        "notes": "Day-level cues mixed with timed entry; model may put cycle/sleep in comments or summary.",
    },
    {
        "case_id": "mixed_emotions_narrative",
        "input_text": "I was excited to start, but during the task I got frustrated and later felt relieved.",
        "notes": "Emotional arc; avoid over-splitting rows.",
    },
    {
        "case_id": "music_context",
        "input_text": "From 2 to 3 I worked on analysis with upbeat music on and felt calm and focused.",
        "notes": "Music + time range.",
    },
    {
        "case_id": "vague_habit_no_times",
        "input_text": "Usually I check messages first thing; today felt the same, low energy, not sure why.",
        "notes": "Habitual / vague; conservative nulls expected.",
    },
    {
        "case_id": "serbian_meeting_anxiety",
        "input_text": "Idem na sastanak i veoma sam anksiozna.",
        "notes": "Serbian; meeting + anxiety.",
    },
    {
        "case_id": "serbian_past_focus",
        "input_text": "Od 14 do 16 sam radila na izveštaju i bila sam fokusirana, uz malo nervoze.",
        "notes": "Serbian past interval with focus/anxiety.",
    },
    {
        "case_id": "serbian_now_tired",
        "input_text": "Sada sam jako umorna i teško mi je da se koncentrišem.",
        "notes": "Serbian present-state; possible capture_time_local alignment.",
    },
    {
        "case_id": "farsi_meeting_anxiety",
        "input_text": "دارم میرم جلسه و خیلی مضطربم.",
        "notes": "Farsi; imminent meeting + anxiety.",
    },
    {
        "case_id": "farsi_work_block",
        "input_text": "از ده تا دوازده روی گزارش کار کردم، انرژیم متوسط بود و کمی هم نگران بودم.",
        "notes": "Farsi explicit interval + energy/anxiety.",
    },
    {
        "case_id": "farsi_present_mood",
        "input_text": "الان حالم بهتره ولی هنوز کمی استرس دارم.",
        "notes": "Farsi present mood; no clock time.",
    },
    {
        "case_id": "mixed_en_farsi_time",
        "input_text": "From 3 to 4 داشتم روی report کار می‌کردم و خیلی focused بودم ولی کمی anxious هم بودم.",
        "notes": "Mixed English/Farsi in one sentence.",
    },
    {
        "case_id": "mixed_en_serbian",
        "input_text": "After lunch I had a call — bio sam prilično fokusiran ali i pod stresom.",
        "notes": "English + Serbian emotional content.",
    },
    {
        "case_id": "mixed_trilingual_snippet",
        "input_text": "Morning: deep work 9-11, felt good. После тога кратак састанак. عصر خسته شدم.",
        "notes": "EN / SR / FA fragments; multi-event.",
    },
    {
        "case_id": "contentment_only_short",
        "input_text": "Quiet hour on the balcony. Felt content, music calm, low anxiety.",
        "notes": "Short paragraph; contentment + music + anxiety cues.",
    },
]

# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


def call_extract(text: str, log_date: str, capture_time_local: str | None, capture_kind: str = "text") -> dict:
    url = f"{API_BASE}/extract-logs"
    payload: dict = {"transcript": text, "log_date": log_date, "capture_kind": capture_kind}
    if capture_time_local is not None:
        payload["capture_time_local"] = capture_time_local

    with httpx.Client(timeout=EXTRACT_TIMEOUT) as client:
        r = client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        r.raise_for_status()
        return r.json()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    run_started = utc_now_iso()
    results: list[dict] = []

    print(f"API: {API_BASE}")
    print(f"log_date: {LOG_DATE}")
    print(f"capture_time_local: {CAPTURE_TIME_LOCAL!r}")
    print(f"default capture_kind: {DEFAULT_CAPTURE_KIND!r}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    for case in TEST_CASES:
        case_id = case["case_id"]
        input_text = case["input_text"]
        notes = case["notes"]
        ck = case.get("capture_kind", DEFAULT_CAPTURE_KIND)
        if ck not in ("voice", "text"):
            ck = DEFAULT_CAPTURE_KIND
        created_at = utc_now_iso()

        try:
            extracted = call_extract(input_text, LOG_DATE, CAPTURE_TIME_LOCAL, ck)
            record = {
                "case_id": case_id,
                "input_text": input_text,
                "notes": notes,
                "log_date": LOG_DATE,
                "status": "ok",
                "extracted_output": extracted,
                "created_at": created_at,
            }
        except httpx.HTTPStatusError as e:
            body = e.response.text[:2000] if e.response is not None else ""
            record = {
                "case_id": case_id,
                "input_text": input_text,
                "notes": notes,
                "log_date": LOG_DATE,
                "status": "error",
                "error": f"HTTP {e.response.status_code if e.response else '?'}: {e!s}\n{body}",
                "created_at": created_at,
            }
        except Exception as e:
            record = {
                "case_id": case_id,
                "input_text": input_text,
                "notes": notes,
                "log_date": LOG_DATE,
                "status": "error",
                "error": str(e),
                "created_at": created_at,
            }

        results.append(record)
        out_file = OUTPUT_DIR / f"{case_id}.json"
        out_file.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  [{record['status']:5}] {case_id} -> {out_file.name}")

    run_finished = utc_now_iso()
    ok_n = sum(1 for r in results if r["status"] == "ok")
    err_n = len(results) - ok_n

    summary = {
        "run_started": run_started,
        "run_finished": run_finished,
        "api_base": API_BASE,
        "log_date": LOG_DATE,
        "capture_time_local": CAPTURE_TIME_LOCAL,
        "case_count": len(results),
        "ok_count": ok_n,
        "error_count": err_n,
        "output_dir": str(OUTPUT_DIR),
        "results": results,
    }
    summary_path = OUTPUT_DIR / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    all_cases = {
        "run_started": run_started,
        "run_finished": run_finished,
        "api_base": API_BASE,
        "log_date": LOG_DATE,
        "capture_time_local": CAPTURE_TIME_LOCAL,
        "case_count": len(results),
        "ok_count": ok_n,
        "error_count": err_n,
        "cases": results,
    }
    all_cases_path = OUTPUT_DIR / "all_cases.json"
    all_cases_path.write_text(json.dumps(all_cases, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print(
        f"Done: {ok_n} ok, {err_n} errors — "
        f"combined: {all_cases_path.name}, summary: {summary_path.name}"
    )
    return 0 if err_n == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
