"""Load and persist EAV values for non-builtin tracker fields."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.schemas import CustomValueRead, CustomValueUpsert
from app.tracker_config_models import TrackerFieldDefinition, TrackerSelectOption
from app.tracker_custom_value_models import LogEntryCustomValue, TrackerDayCustomValue
from app.models import LogEntry, TrackerDay


class CustomValuesError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(detail)


def _read_row(r: LogEntryCustomValue | TrackerDayCustomValue) -> CustomValueRead:
    return CustomValueRead(
        field_definition_id=r.field_definition_id,
        value_text=r.value_text,
        value_number=r.value_number,
        select_option_id=r.select_option_id,
    )


def load_custom_values_for_log_entries(db: Session, entry_ids: list[int]) -> dict[int, list[CustomValueRead]]:
    if not entry_ids:
        return {}
    rows = (
        db.query(LogEntryCustomValue)
        .filter(LogEntryCustomValue.log_entry_id.in_(entry_ids))
        .order_by(LogEntryCustomValue.field_definition_id.asc())
        .all()
    )
    out: dict[int, list[CustomValueRead]] = defaultdict(list)
    for r in rows:
        out[r.log_entry_id].append(_read_row(r))
    return dict(out)


def load_custom_values_for_tracker_day(db: Session, user_id: int, log_date: date) -> list[CustomValueRead]:
    rows = (
        db.query(TrackerDayCustomValue)
        .filter(TrackerDayCustomValue.user_id == user_id, TrackerDayCustomValue.log_date == log_date)
        .order_by(TrackerDayCustomValue.field_definition_id.asc())
        .all()
    )
    return [_read_row(r) for r in rows]


def _validate_upsert_for_field(fd: TrackerFieldDefinition, row: CustomValueUpsert) -> tuple[str, str | None, float | None, int | None]:
    """Return (mode, value_text, value_number, select_option_id) where mode is 'delete' or 'set'."""
    if fd.is_builtin:
        raise CustomValuesError("invalid_field", "Not a custom field")
    if fd.field_type not in ("text", "number", "select"):
        raise CustomValuesError("invalid_field", "Unsupported custom field type")

    vt, vn, so = row.value_text, row.value_number, row.select_option_id
    all_none = vt is None and vn is None and so is None
    if all_none:
        return ("delete", None, None, None)

    if fd.field_type == "text":
        if vn is not None or so is not None:
            raise CustomValuesError("invalid_value", "Text field accepts value_text only")
        s = (vt or "").strip()
        if not s:
            return ("delete", None, None, None)
        return ("set", s, None, None)

    if fd.field_type == "number":
        if vt is not None or so is not None:
            raise CustomValuesError("invalid_value", "Number field accepts value_number only")
        if vn is None:
            return ("delete", None, None, None)
        return ("set", None, float(vn), None)

    # select
    if vt is not None or vn is not None:
        raise CustomValuesError("invalid_value", "Select field accepts select_option_id only")
    if so is None:
        return ("delete", None, None, None)
    opt = db.get(TrackerSelectOption, so)
    if opt is None or opt.field_definition_id != fd.id:
        raise CustomValuesError("invalid_option", "Invalid option for this field")
    return ("set", None, None, so)


def apply_log_entry_custom_values_put(db: Session, user_id: int, entry_id: int, rows: list[CustomValueUpsert]) -> None:
    entry = db.get(LogEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise CustomValuesError("not_found", "Log entry not found")

    seen: set[int] = set()
    for row in rows:
        if row.field_definition_id in seen:
            raise CustomValuesError("duplicate_field", f"Duplicate field_definition_id {row.field_definition_id}")
        seen.add(row.field_definition_id)

        fd = db.get(TrackerFieldDefinition, row.field_definition_id)
        if fd is None:
            raise CustomValuesError("invalid_field", "Unknown field")
        if fd.scope != "entry":
            raise CustomValuesError("invalid_scope", "Field is not an entry field")

        mode, vtext, vnum, sid = _validate_upsert_for_field(fd, row)
        existing = (
            db.query(LogEntryCustomValue)
            .filter(
                LogEntryCustomValue.log_entry_id == entry_id,
                LogEntryCustomValue.field_definition_id == fd.id,
            )
            .one_or_none()
        )
        if mode == "delete":
            if existing is not None:
                db.delete(existing)
            continue
        if existing is None:
            db.add(
                LogEntryCustomValue(
                    log_entry_id=entry_id,
                    field_definition_id=fd.id,
                    value_text=vtext,
                    value_number=vnum,
                    select_option_id=sid,
                )
            )
        else:
            existing.value_text = vtext
            existing.value_number = vnum
            existing.select_option_id = sid


def _ensure_tracker_day_row(db: Session, user_id: int, log_date: date) -> None:
    row = (
        db.query(TrackerDay)
        .filter(TrackerDay.user_id == user_id, TrackerDay.log_date == log_date)
        .one_or_none()
    )
    if row is None:
        db.add(TrackerDay(user_id=user_id, log_date=log_date))


def apply_tracker_day_custom_values_put(db: Session, user_id: int, log_date: date, rows: list[CustomValueUpsert]) -> None:
    _ensure_tracker_day_row(db, user_id, log_date)

    seen: set[int] = set()
    for row in rows:
        if row.field_definition_id in seen:
            raise CustomValuesError("duplicate_field", f"Duplicate field_definition_id {row.field_definition_id}")
        seen.add(row.field_definition_id)

        fd = db.get(TrackerFieldDefinition, row.field_definition_id)
        if fd is None:
            raise CustomValuesError("invalid_field", "Unknown field")
        if fd.scope != "day":
            raise CustomValuesError("invalid_scope", "Field is not a day field")

        mode, vtext, vnum, sid = _validate_upsert_for_field(fd, row)
        existing = (
            db.query(TrackerDayCustomValue)
            .filter(
                TrackerDayCustomValue.user_id == user_id,
                TrackerDayCustomValue.log_date == log_date,
                TrackerDayCustomValue.field_definition_id == fd.id,
            )
            .one_or_none()
        )
        if mode == "delete":
            if existing is not None:
                db.delete(existing)
            continue
        if existing is None:
            db.add(
                TrackerDayCustomValue(
                    user_id=user_id,
                    log_date=log_date,
                    field_definition_id=fd.id,
                    value_text=vtext,
                    value_number=vnum,
                    select_option_id=sid,
                )
            )
        else:
            existing.value_text = vtext
            existing.value_number = vnum
            existing.select_option_id = sid


def next_display_order_for_scope(db: Session, scope: str) -> int:
    m = db.query(func.max(TrackerFieldDefinition.display_order)).filter(TrackerFieldDefinition.scope == scope).scalar()
    return (m or 0) + 10
