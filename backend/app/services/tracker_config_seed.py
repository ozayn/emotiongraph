"""Idempotent seed for tracker field definitions and select options."""

from sqlalchemy.orm import Session

from app.tracker_config_models import TrackerFieldDefinition, TrackerSelectOption


def _opts(rows: list[tuple[str, str, int]]) -> list[dict]:
    """(value, label, display_order)"""
    return [
        {"value": v, "label": lab, "display_order": ord_, "is_active": True}
        for v, lab, ord_ in rows
    ]


def seed_tracker_config_if_empty(session: Session) -> None:
    if session.query(TrackerFieldDefinition).first() is not None:
        return

    seed_fields: list[dict] = [
        {
            "key": "start_time",
            "label": "Start",
            "scope": "entry",
            "field_type": "time",
            "is_required": False,
            "is_active": True,
            "display_order": 10,
            "options": [],
        },
        {
            "key": "end_time",
            "label": "End",
            "scope": "entry",
            "field_type": "time",
            "is_required": False,
            "is_active": True,
            "display_order": 20,
            "options": [],
        },
        {
            "key": "event",
            "label": "What happened",
            "scope": "entry",
            "field_type": "text",
            "is_required": False,
            "is_active": True,
            "display_order": 30,
            "options": [],
        },
        {
            "key": "energy_level",
            "label": "Energy",
            "scope": "entry",
            "field_type": "select",
            "is_required": False,
            "is_active": True,
            "display_order": 40,
            "options": _opts(
                [
                    ("", "—", 0),
                    ("1", "1 — Low energy", 10),
                    ("2", "2 — Neutral", 20),
                    ("3", "3 — High energy", 30),
                ]
            ),
        },
        {
            "key": "anxiety",
            "label": "Anxiety",
            "scope": "entry",
            "field_type": "select",
            "is_required": False,
            "is_active": True,
            "display_order": 50,
            "options": _opts(
                [
                    ("", "—", 0),
                    ("0", "0 — Not at all", 10),
                    ("1", "1 — A little", 20),
                    ("2", "2 — Moderately", 30),
                    ("3", "3 — Very much", 40),
                ]
            ),
        },
        {
            "key": "contentment",
            "label": "Contentment",
            "scope": "entry",
            "field_type": "select",
            "is_required": False,
            "is_active": True,
            "display_order": 60,
            "options": _opts(
                [
                    ("", "—", 0),
                    ("1", "1 — A little", 10),
                    ("2", "2 — Moderately", 20),
                    ("3", "3 — Very much", 30),
                ]
            ),
        },
        {
            "key": "focus",
            "label": "Focus",
            "scope": "entry",
            "field_type": "select",
            "is_required": False,
            "is_active": True,
            "display_order": 70,
            "options": _opts(
                [
                    ("", "—", 0),
                    ("1", "1 — Distracted", 10),
                    ("2", "2 — Mostly distracted", 20),
                    ("3", "3 — Mixed", 30),
                    ("4", "4 — Mostly focused", 40),
                    ("5", "5 — Deep focus", 50),
                ]
            ),
        },
        {
            "key": "music",
            "label": "Music",
            "scope": "entry",
            "field_type": "select",
            "is_required": False,
            "is_active": True,
            "display_order": 80,
            "options": _opts(
                [
                    ("", "—", 0),
                    ("No", "No", 10),
                    ("Yes, upbeat", "Yes, upbeat", 20),
                    ("Yes, calm", "Yes, calm", 30),
                    ("Yes, other", "Yes, other", 40),
                ]
            ),
        },
        {
            "key": "comments",
            "label": "Comments",
            "scope": "entry",
            "field_type": "textarea",
            "is_required": False,
            "is_active": True,
            "display_order": 90,
            "options": [],
        },
        {
            "key": "cycle_day",
            "label": "Cycle day",
            "scope": "day",
            "field_type": "number",
            "is_required": False,
            "is_active": True,
            "display_order": 10,
            "options": [],
        },
        {
            "key": "sleep_hours",
            "label": "Sleep (hours)",
            "scope": "day",
            "field_type": "number",
            "is_required": False,
            "is_active": True,
            "display_order": 20,
            "options": [],
        },
        {
            "key": "sleep_quality",
            "label": "Sleep quality",
            "scope": "day",
            "field_type": "select",
            "is_required": False,
            "is_active": True,
            "display_order": 30,
            "options": _opts(
                [
                    ("", "—", 0),
                    ("1", "1 — Very poor", 10),
                    ("2", "2 — Poor", 20),
                    ("3", "3 — OK", 30),
                    ("4", "4 — Good", 40),
                    ("5", "5 — Excellent", 50),
                ]
            ),
        },
    ]

    for fd in seed_fields:
        opts = fd.pop("options", [])
        row = TrackerFieldDefinition(**fd)
        session.add(row)
        session.flush()
        for o in opts:
            session.add(
                TrackerSelectOption(
                    field_definition_id=row.id,
                    value=o["value"],
                    label=o["label"],
                    display_order=o["display_order"],
                    is_active=o["is_active"],
                )
            )

    session.commit()
