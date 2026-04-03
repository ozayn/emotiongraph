"""
Import tracker-style CSV data for the Test user only.

Idempotent: clears ``source_type == "import"`` log rows and all ``tracker_days`` for Test, then loads
fresh data.

**Zip archives (``sample_data/emotiongraph_test_csvs.zip`` style):** multiple ``YYYY-MM-DD.csv``
files — ``log_date`` is taken from the filename; human-readable metric cells (e.g. ``2 - neutral``)
and sleep range strings (e.g. ``22:30-06:00``) are parsed.

**Single CSV:** requires a ``log_date`` / ``date`` column (plain ISO or per-row dates).

Blank / ``Unnamed`` columns are ignored.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, TextIO

from sqlalchemy.orm import Session

from app.models import LogEntry, TrackerDay, User

TEST_USER_EMAIL = "test@emotiongraph.local"

_STEM_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_SLEEP_RANGE_RE = re.compile(r"^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$")

HEADER_ALIASES: dict[str, str] = {
    "date": "log_date",
    "logdate": "log_date",
    "energy": "energy_level",
}


def _normalize_header(key: str | None) -> str | None:
    if key is None:
        return None
    s = str(key).strip().lower().replace(" ", "_").replace("-", "_")
    if not s:
        return None
    if re.match(r"^unnamed:?\d*$", s):
        return None
    if s.startswith("unnamed"):
        return None
    return HEADER_ALIASES.get(s, s)


def _parse_date(raw: str | None) -> date | None:
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip()
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _log_date_from_zip_stem(archive_path: str) -> date | None:
    stem = Path(archive_path).stem
    m = _STEM_DATE_RE.match(stem)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _parse_str(raw: str | None, max_len: int) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    return s[:max_len] if len(s) > max_len else s


def _normalize_time_cell(raw: str | None) -> str | None:
    s = _parse_str(raw, 32)
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


def _parse_music(raw: str | None) -> str | None:
    s = _parse_str(raw, 64)
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
    if head.startswith("poor"):
        return 2
    if head.startswith("fair"):
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


def _normalize_csv_row(row: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in row.items():
        nk = _normalize_header(k)
        if nk is None:
            continue
        out[nk] = v if v is not None else ""
    return out


def _prepare_test_user(session: Session) -> User:
    user = session.query(User).filter(User.email == TEST_USER_EMAIL).one_or_none()
    if user is None:
        raise ValueError(f"No user with email {TEST_USER_EMAIL!r}; run the app once to seed users.")
    session.query(LogEntry).filter(LogEntry.user_id == user.id, LogEntry.source_type == "import").delete(
        synchronize_session=False
    )
    session.query(TrackerDay).filter(TrackerDay.user_id == user.id).delete(synchronize_session=False)
    session.flush()
    return user


def _merge_tracker_field(df: dict[str, Any], key: str, value: Any) -> None:
    if value is None:
        return
    if df[key] is None:
        df[key] = value


def _consume_reader(
    user_id: int,
    reader: csv.DictReader,
    fixed_log_date: date | None,
    day_fields: dict[date, dict[str, Any]],
    log_entries: list[LogEntry],
) -> int:
    rows_read = 0
    for raw in reader:
        rows_read += 1
        row = _normalize_csv_row(raw)
        log_d = fixed_log_date if fixed_log_date is not None else _parse_date(row.get("log_date"))
        if log_d is None:
            continue

        cd = _parse_cycle_day_cell(row.get("cycle_day"))
        sh = _parse_sleep_hours_cell(row.get("sleep_hours"))
        sq = _parse_sleep_quality_cell(row.get("sleep_quality"))

        df = day_fields[log_d]
        _merge_tracker_field(df, "cycle_day", cd)
        _merge_tracker_field(df, "sleep_hours", sh)
        _merge_tracker_field(df, "sleep_quality", sq)

        event = _parse_str(row.get("event"), 10_000)
        st = _normalize_time_cell(row.get("start_time"))
        et = _normalize_time_cell(row.get("end_time"))
        el = _parse_energy_cell(row.get("energy_level"))
        ax = _parse_scale_cell(row.get("anxiety"), {0, 1, 2, 3})
        ct = _parse_scale_cell(row.get("contentment"), {1, 2, 3})
        fo = _parse_scale_cell(row.get("focus"), {1, 2, 3, 4, 5})
        ag = _parse_scale_cell(row.get("anger"), {0, 1, 2, 3})
        mu = _parse_music(row.get("music"))
        co = _parse_str(row.get("comments"), 50_000)

        has_entry = any(x is not None for x in (event, st, et, el, ax, ct, fo, ag, mu, co))
        if not has_entry:
            continue

        log_entries.append(
            LogEntry(
                user_id=user_id,
                log_date=log_d,
                start_time=st,
                end_time=et,
                event=event,
                energy_level=el,
                anxiety=ax,
                contentment=ct,
                focus=fo,
                anger=ag,
                music=mu,
                comments=co,
                source_type="import",
            )
        )
    return rows_read


def _finalize(session: Session, user: User, day_fields: dict[date, dict[str, Any]], log_entries: list[LogEntry]) -> None:
    tracker_rows: list[TrackerDay] = []
    for log_d, fields in sorted(day_fields.items()):
        if not any(fields[k] is not None for k in ("cycle_day", "sleep_hours", "sleep_quality")):
            continue
        tracker_rows.append(
            TrackerDay(
                user_id=user.id,
                log_date=log_d,
                cycle_day=fields["cycle_day"],
                sleep_hours=fields["sleep_hours"],
                sleep_quality=fields["sleep_quality"],
            )
        )
    session.add_all(log_entries)
    session.add_all(tracker_rows)
    session.commit()


def _zip_csv_members(zf: zipfile.ZipFile) -> list[str]:
    return sorted(
        n
        for n in zf.namelist()
        if not n.endswith("/") and n.lower().endswith(".csv")
    )


def import_test_tracker_csv(session: Session, csv_path: Path) -> dict[str, Any]:
    path = Path(csv_path)
    if not path.is_file():
        raise FileNotFoundError(path)

    user = _prepare_test_user(session)
    day_fields: dict[date, dict[str, Any]] = defaultdict(
        lambda: {"cycle_day": None, "sleep_hours": None, "sleep_quality": None}
    )
    log_entries: list[LogEntry] = []

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows_read = _consume_reader(user.id, reader, None, day_fields, log_entries)

    _finalize(session, user, day_fields, log_entries)
    td_count = sum(
        1
        for f in day_fields.values()
        if any(f[k] is not None for k in ("cycle_day", "sleep_hours", "sleep_quality"))
    )
    return {
        "rows_read": rows_read,
        "log_entries": len(log_entries),
        "tracker_days": td_count,
        "source": path.name,
        "csv_files": 1,
    }


def import_test_tracker_zip(session: Session, zip_path: Path) -> dict[str, Any]:
    path = Path(zip_path)
    if not path.is_file():
        raise FileNotFoundError(path)

    user = _prepare_test_user(session)
    day_fields: dict[date, dict[str, Any]] = defaultdict(
        lambda: {"cycle_day": None, "sleep_hours": None, "sleep_quality": None}
    )
    log_entries: list[LogEntry] = []
    rows_read = 0
    csv_files = 0
    used_members: list[str] = []

    with zipfile.ZipFile(path, "r") as zf:
        members = _zip_csv_members(zf)
        if not members:
            raise ValueError("No .csv files found inside the zip archive.")

        dated = [(m, d) for m in members if (d := _log_date_from_zip_stem(m)) is not None]
        if len(dated) == len(members):
            for member, log_d in sorted(dated, key=lambda x: x[1]):
                csv_files += 1
                used_members.append(member)
                with zf.open(member, "r") as raw:
                    stream = io.TextIOWrapper(raw, encoding="utf-8", newline="")
                    reader = csv.DictReader(stream)
                    rows_read += _consume_reader(user.id, reader, log_d, day_fields, log_entries)
        elif len(members) == 1:
            csv_files = 1
            used_members.append(members[0])
            with zf.open(members[0], "r") as raw:
                stream = io.TextIOWrapper(raw, encoding="utf-8", newline="")
                reader = csv.DictReader(stream)
                rows_read = _consume_reader(user.id, reader, None, day_fields, log_entries)
        else:
            raise ValueError(
                "Zip has multiple CSV files but not all are named YYYY-MM-DD.csv. "
                "Either use one combined CSV with a log_date column, or name each file by date."
            )

    _finalize(session, user, day_fields, log_entries)
    td_count = len(
        [
            d
            for d, f in day_fields.items()
            if any(f[k] is not None for k in ("cycle_day", "sleep_hours", "sleep_quality"))
        ]
    )
    return {
        "rows_read": rows_read,
        "log_entries": len(log_entries),
        "tracker_days": td_count,
        "source": path.name,
        "csv_files": csv_files,
        "csv_members": used_members,
    }
