"""
Build a CSV export of log entries for one user and date range, shaped like the legacy tracker sheets.

Day-level fields (cycle day, sleep hours, sleep quality) are repeated on *every* row for that
calendar day so each line is self-contained in Excel/Sheets (no sparse "first row only" merge logic).
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date

from sqlalchemy.orm import Session

from app.models import LogEntry, TrackerDay, User

# Match insights export cap
MAX_EXPORT_RANGE_DAYS = 400

_CSV_COLUMNS = [
    "start time",
    "end time",
    "event",
    "energy level",
    "anxiety",
    "contentment",
    "focus",
    "music",
    "comments",
    "cycle day",
    "sleep hours",
    "sleep quality",
]

_ENERGY = {
    1: "1 - low energy",
    2: "2 - neutral",
    3: "3 - high energy",
}
_ANXIETY = {
    0: "0 - Not at all",
    1: "1 - A little",
    2: "2 - Moderately",
    3: "3 - Very much",
}
_CONTENTMENT = {
    1: "1 - A little",
    2: "2 - Moderately",
    3: "3 - Very much",
}
_FOCUS = {
    1: "1 - Distracted",
    2: "2 - Mostly distracted",
    3: "3 - Mixed",
    4: "4 - Mostly focused",
    5: "5 - Deep focus",
}
_SLEEP_Q = {
    1: "1 - Very poor",
    2: "2 - Poor",
    3: "3 - OK",
    4: "4 - Good",
    5: "5 - Excellent",
}


def _fmt_time(raw: str | None) -> str:
    """Match spreadsheet style HH:MM:SS when stored as HH:MM."""
    if raw is None or not str(raw).strip():
        return ""
    t = str(raw).strip()
    if re.match(r"^\d{1,2}:\d{2}$", t):
        return f"{t}:00"
    return t


def _fmt_sleep_hours(x: float | None) -> str:
    if x is None:
        return ""
    if float(x) == int(x):
        return str(int(x))
    s = f"{float(x):.4f}".rstrip("0").rstrip(".")
    return s


def _map_scale(m: dict[int, str], v: int | None) -> str:
    if v is None:
        return ""
    return m.get(v, str(v))


def _sanitize_filename_slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower())
    return (s.strip("_") or "user")[:48]


def build_export_filename(user: User, start: date, end: date) -> str:
    slug = _sanitize_filename_slug(user.name)
    return f"emotiongraph_{slug}_{start.isoformat()}_to_{end.isoformat()}.csv"


def build_logs_csv(db: Session, user_id: int, start: date, end: date) -> str:
    """Return UTF-8 CSV text (no BOM). One row per log entry in range; header always present."""
    entries = (
        db.query(LogEntry)
        .filter(LogEntry.user_id == user_id, LogEntry.log_date >= start, LogEntry.log_date <= end)
        .order_by(LogEntry.log_date.asc(), LogEntry.id.asc())
        .all()
    )
    tracker_rows = (
        db.query(TrackerDay)
        .filter(TrackerDay.user_id == user_id, TrackerDay.log_date >= start, TrackerDay.log_date <= end)
        .all()
    )
    by_day: dict[date, TrackerDay] = {t.log_date: t for t in tracker_rows}

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()

    for e in entries:
        td = by_day.get(e.log_date)
        cycle = "" if td is None or td.cycle_day is None else str(td.cycle_day)
        sleep_h = "" if td is None else _fmt_sleep_hours(td.sleep_hours)
        sleep_q = "" if td is None or td.sleep_quality is None else _SLEEP_Q.get(td.sleep_quality, str(td.sleep_quality))

        writer.writerow(
            {
                "start time": _fmt_time(e.start_time),
                "end time": _fmt_time(e.end_time),
                "event": e.event or "",
                "energy level": _map_scale(_ENERGY, e.energy_level),
                "anxiety": _map_scale(_ANXIETY, e.anxiety),
                "contentment": _map_scale(_CONTENTMENT, e.contentment),
                "focus": _map_scale(_FOCUS, e.focus),
                "music": e.music or "",
                "comments": e.comments or "",
                "cycle day": cycle,
                "sleep hours": sleep_h,
                "sleep quality": sleep_q,
            }
        )

    return buf.getvalue()
