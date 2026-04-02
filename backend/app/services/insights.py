"""Aggregate log + tracker data for the Insights UI (per user, date range)."""

from collections import defaultdict
from datetime import date, timedelta
from statistics import mean

from sqlalchemy.orm import Session

from app.models import LogEntry, TrackerDay

MAX_RANGE_DAYS = 400


def _daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _avg_ints(values: list[int | None]) -> float | None:
    xs = [v for v in values if v is not None]
    if not xs:
        return None
    return round(mean(xs), 2)


def _avg_floats(values: list[float | None]) -> float | None:
    xs = [v for v in values if v is not None]
    if not xs:
        return None
    return round(mean(xs), 2)


def build_insights_payload(db: Session, user_id: int, start: date, end: date) -> dict:
    entries = (
        db.query(LogEntry)
        .filter(
            LogEntry.user_id == user_id,
            LogEntry.log_date >= start,
            LogEntry.log_date <= end,
        )
        .order_by(LogEntry.log_date.asc(), LogEntry.id.asc())
        .all()
    )

    by_day: dict[date, list[LogEntry]] = defaultdict(list)
    for e in entries:
        by_day[e.log_date].append(e)

    days_with_entries = len(by_day)

    daily_points = []
    for d in _daterange(start, end):
        day_es = by_day.get(d, [])
        daily_points.append(
            {
                "log_date": d,
                "entry_count": len(day_es),
                "avg_energy": _avg_ints([x.energy_level for x in day_es]),
                "avg_anxiety": _avg_ints([x.anxiety for x in day_es]),
                "avg_contentment": _avg_ints([x.contentment for x in day_es]),
                "avg_focus": _avg_ints([x.focus for x in day_es]),
            }
        )

    summary = {
        "entry_count": len(entries),
        "days_with_entries": days_with_entries,
        "avg_energy": _avg_ints([e.energy_level for e in entries]),
        "avg_anxiety": _avg_ints([e.anxiety for e in entries]),
        "avg_contentment": _avg_ints([e.contentment for e in entries]),
        "avg_focus": _avg_ints([e.focus for e in entries]),
    }

    recent = (
        db.query(LogEntry)
        .filter(
            LogEntry.user_id == user_id,
            LogEntry.log_date >= start,
            LogEntry.log_date <= end,
        )
        .order_by(LogEntry.created_at.desc())
        .limit(25)
        .all()
    )
    # source_type is NOT NULL in the model, but legacy DB rows may still be NULL → Pydantic would 500 the whole /insights response.
    recent_entries = [
        {
            "id": e.id,
            "log_date": e.log_date,
            "created_at": e.created_at,
            "event": e.event,
            "energy_level": e.energy_level,
            "anxiety": e.anxiety,
            "contentment": e.contentment,
            "focus": e.focus,
            "source_type": (e.source_type or "manual").strip() or "manual",
        }
        for e in recent
    ]

    by_event: dict[str, list[LogEntry]] = defaultdict(list)
    for e in entries:
        label = (e.event or "").strip() or "(No description)"
        by_event[label].append(e)

    event_patterns = []
    for label, evs in sorted(by_event.items(), key=lambda x: (-len(x[1]), x[0].lower()))[:15]:
        event_patterns.append(
            {
                "event_label": label if len(label) <= 200 else label[:197] + "…",
                "count": len(evs),
                "avg_energy": _avg_ints([x.energy_level for x in evs]),
                "avg_anxiety": _avg_ints([x.anxiety for x in evs]),
                "avg_contentment": _avg_ints([x.contentment for x in evs]),
                "avg_focus": _avg_ints([x.focus for x in evs]),
            }
        )

    tracker_rows = (
        db.query(TrackerDay)
        .filter(
            TrackerDay.user_id == user_id,
            TrackerDay.log_date >= start,
            TrackerDay.log_date <= end,
        )
        .order_by(TrackerDay.log_date.asc())
        .all()
    )

    has_any_tracker = any(
        t.sleep_quality is not None or t.cycle_day is not None or t.sleep_hours is not None for t in tracker_rows
    )

    tracker_daily = [
        {
            "log_date": t.log_date,
            "sleep_quality": t.sleep_quality,
            "cycle_day": t.cycle_day,
            "sleep_hours": t.sleep_hours,
        }
        for t in tracker_rows
        if t.sleep_quality is not None or t.cycle_day is not None or t.sleep_hours is not None
    ]

    cycle_vals = [t.cycle_day for t in tracker_rows if t.cycle_day is not None]
    tracker_summary = {
        "days_with_tracker": len(tracker_daily),
        "avg_sleep_quality": _avg_ints([t.sleep_quality for t in tracker_rows if t.sleep_quality is not None]),
        "avg_cycle_day": round(mean(cycle_vals), 1) if cycle_vals else None,
        "avg_sleep_hours": _avg_floats([t.sleep_hours for t in tracker_rows if t.sleep_hours is not None]),
        "has_data": has_any_tracker,
    }

    return {
        "start_date": start,
        "end_date": end,
        "summary": summary,
        "daily": daily_points,
        "recent_entries": recent_entries,
        "event_patterns": event_patterns,
        "tracker_summary": tracker_summary,
        "tracker_daily": tracker_daily,
    }
