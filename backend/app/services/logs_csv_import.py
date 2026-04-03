"""
Parse user CSV uploads for bulk log import (source_type ``import``).

Expected columns (case-insensitive; spaces/underscores normalized):
  - ``log_date`` or ``date`` — required per data row (YYYY-MM-DD)
  - Same as default export: ``start time``, ``end time``, ``event``, ``energy level``, ``anxiety``,
    ``contentment``, ``focus``, ``music``, ``comments``, ``cycle day``, ``sleep hours``,
    ``sleep quality``
  - Optional: ``anger`` (0–3) — accepted on import though omitted from default CSV export

Human-readable scale cells (e.g. ``2 - neutral``) are accepted; see parsers below.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import LogEntry, TrackerDay
from app.schemas import LogImportRowIn

MAX_IMPORT_ROWS = 2000
MAX_IMPORT_BYTES = 2 * 1024 * 1024

_SLEEP_RANGE_RE = re.compile(r"^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$")


def _normalize_header(key: str | None) -> str | None:
    if key is None:
        return None
    s = str(key).strip().lower().replace(" ", "_").replace("-", "_")
    if not s or re.match(r"^unnamed", s):
        return None
    if s == "date":
        return "log_date"
    if s == "energy":
        return "energy_level"
    return s


def _cell_str(raw: str | None, max_len: int | None = None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if max_len is not None and len(s) > max_len:
        return s[:max_len]
    return s


def _normalize_time_cell(raw: str | None) -> str | None:
    s = _cell_str(raw, 32)
    if s is None:
        return None
    parts = s.split(":")
    if len(parts) == 3 and parts[2] == "00":
        return f"{parts[0]}:{parts[1]}"
    return s


def _leading_int(raw: str | None) -> int | None:
    if raw is None or not str(raw).strip():
        return None
    m = re.match(r"^(\d+)", str(raw).strip())
    if not m:
        return None
    return int(m.group(1))


def _parse_energy_cell(raw: str | None) -> int | None:
    n = _leading_int(raw)
    if n is not None and n in (1, 2, 3):
        return n
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip().lower()
    if "low" in s:
        return 1
    if "high" in s:
        return 3
    if "neutral" in s:
        return 2
    return None


def _parse_scale_cell(raw: str | None, allowed: set[int]) -> int | None:
    n = _leading_int(raw)
    if n is not None and n in allowed:
        return n
    return None


MUSIC_ALLOWED = frozenset({"No", "Yes, upbeat", "Yes, calm", "Yes, other"})


def _parse_music_cell(raw: str | None) -> str | None:
    s = _cell_str(raw, 64)
    if s is None:
        return None
    return s if s in MUSIC_ALLOWED else None


def _parse_sleep_hours_cell(raw: str | None) -> float | None:
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip()
    try:
        f = float(s)
        if 0 <= f <= 24:
            return round(f, 4)
    except ValueError:
        pass
    m = _SLEEP_RANGE_RE.match(s)
    if not m:
        return None

    def to_min(t: str) -> int:
        h, mi = t.split(":")
        return int(h) * 60 + int(mi)

    a = to_min(m.group(1))
    b = to_min(m.group(2))
    if b >= a:
        mins = b - a
    else:
        mins = 24 * 60 - a + b
    return round(mins / 60.0, 4)


def _parse_sleep_quality_cell(raw: str | None) -> int | None:
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip()
    m = re.match(r"^(\d+)", s)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 5:
            return n
    head = s.split(",")[0].strip().lower()
    if head.startswith("very poor"):
        return 1
    if head.startswith("poor") and not head.startswith("very"):
        return 2
    if head.startswith("ok") or head.startswith("fair"):
        return 3
    if head.startswith("good"):
        return 4
    if head.startswith("excellent"):
        return 5
    return None


def _parse_cycle_day_cell(raw: str | None) -> int | None:
    n = _leading_int(raw)
    if n is not None and 1 <= n <= 366:
        return n
    return None


def _parse_date_cell(raw: str | None) -> date | None:
    s = _cell_str(raw, 32)
    if s is None:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _normalized_row(raw: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in raw.items():
        nk = _normalize_header(k)
        if nk is None:
            continue
        out[nk] = v if v is not None else ""
    return out


def _row_has_any_data(norm: dict[str, str]) -> bool:
    return any(str(v).strip() for v in norm.values())


def _cells_to_payload(norm: dict[str, str]) -> dict[str, Any]:
    """Map normalized string cells to typed payload for LogImportRowIn."""
    ld = _parse_date_cell(norm.get("log_date", ""))
    payload: dict[str, Any] = {"log_date": ld}
    payload["start_time"] = _normalize_time_cell(norm.get("start_time"))
    payload["end_time"] = _normalize_time_cell(norm.get("end_time"))
    payload["event"] = _cell_str(norm.get("event"))
    payload["energy_level"] = _parse_energy_cell(norm.get("energy_level"))
    payload["anxiety"] = _parse_scale_cell(norm.get("anxiety"), {0, 1, 2, 3})
    payload["contentment"] = _parse_scale_cell(norm.get("contentment"), {1, 2, 3})
    payload["focus"] = _parse_scale_cell(norm.get("focus"), {1, 2, 3, 4, 5})
    payload["anger"] = _parse_scale_cell(norm.get("anger"), {0, 1, 2, 3})
    payload["music"] = _parse_music_cell(norm.get("music"))
    payload["comments"] = _cell_str(norm.get("comments"))
    payload["cycle_day"] = _parse_cycle_day_cell(norm.get("cycle_day"))
    sh = norm.get("sleep_hours", "")
    payload["sleep_hours"] = _parse_sleep_hours_cell(sh) if sh else None
    payload["sleep_quality"] = _parse_sleep_quality_cell(norm.get("sleep_quality"))
    return payload


def parse_logs_import_csv(text: str) -> tuple[list[LogImportRowIn], list[str]]:
    """
    Parse CSV text into validated import rows.

    Returns (rows, errors). Rows omit lines that fail validation; errors describe skips.
    """
    errors: list[str] = []
    rows: list[LogImportRowIn] = []
    f = io.StringIO(text)
    reader = csv.DictReader(f)
    if reader.fieldnames is None:
        return [], ["CSV has no header row"]

    line_num = 1
    for raw in reader:
        line_num += 1
        norm = _normalized_row(raw)
        if not _row_has_any_data(norm):
            continue
        payload = _cells_to_payload(norm)
        ld = payload.get("log_date")
        if ld is None:
            errors.append(f"Line {line_num}: missing or invalid log_date (use YYYY-MM-DD)")
            continue
        try:
            row = LogImportRowIn.model_validate(payload)
        except ValidationError as e:
            errors.append(f"Line {line_num}: {e.errors()[0]['msg']}")
            continue
        rows.append(row)
        if len(rows) > MAX_IMPORT_ROWS:
            errors.append(f"Import capped at {MAX_IMPORT_ROWS} rows; extra lines ignored")
            break

    return rows, errors


def _has_log_fields(r: LogImportRowIn) -> bool:
    return any(
        [
            r.start_time,
            r.end_time,
            r.event,
            r.energy_level is not None,
            r.anxiety is not None,
            r.contentment is not None,
            r.focus is not None,
            r.anger is not None,
            r.music,
            r.comments,
        ]
    )


def execute_log_import(db: Session, user_id: int, rows: list[LogImportRowIn]) -> list[LogEntry]:
    """Insert log entries (source_type import) and upsert tracker days. Returns created log rows."""
    if len(rows) > MAX_IMPORT_ROWS:
        raise ValueError(f"At most {MAX_IMPORT_ROWS} rows per import")

    tracker_by_date: dict[date, dict[str, Any]] = {}
    for r in rows:
        d = r.log_date
        bucket = tracker_by_date.setdefault(d, {})
        if r.cycle_day is not None:
            bucket["cycle_day"] = r.cycle_day
        if r.sleep_hours is not None:
            bucket["sleep_hours"] = r.sleep_hours
        if r.sleep_quality is not None:
            bucket["sleep_quality"] = r.sleep_quality

    created: list[LogEntry] = []
    for r in rows:
        if not _has_log_fields(r):
            continue
        entry = LogEntry(
            user_id=user_id,
            log_date=r.log_date,
            start_time=r.start_time,
            end_time=r.end_time,
            event=r.event,
            energy_level=r.energy_level,
            anxiety=r.anxiety,
            contentment=r.contentment,
            focus=r.focus,
            anger=r.anger,
            music=r.music,
            comments=r.comments,
            source_type="import",
        )
        db.add(entry)
        created.append(entry)

    for ld, fields in tracker_by_date.items():
        if not fields:
            continue
        existing = (
            db.query(TrackerDay)
            .filter(TrackerDay.user_id == user_id, TrackerDay.log_date == ld)
            .one_or_none()
        )
        if existing is None:
            db.add(
                TrackerDay(
                    user_id=user_id,
                    log_date=ld,
                    cycle_day=fields.get("cycle_day"),
                    sleep_hours=fields.get("sleep_hours"),
                    sleep_quality=fields.get("sleep_quality"),
                )
            )
        else:
            if "cycle_day" in fields:
                existing.cycle_day = fields["cycle_day"]
            if "sleep_hours" in fields:
                existing.sleep_hours = fields["sleep_hours"]
            if "sleep_quality" in fields:
                existing.sleep_quality = fields["sleep_quality"]

    db.commit()
    for e in created:
        db.refresh(e)
    return created
