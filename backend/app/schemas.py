from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

MUSIC_VALUES = ("No", "Yes, upbeat", "Yes, calm", "Yes, other")


def validate_iana_timezone(v: str) -> str:
    s = str(v).strip()
    if not s:
        raise ValueError("timezone must be non-empty")
    try:
        ZoneInfo(s)
    except ZoneInfoNotFoundError as e:
        raise ValueError(f"unknown IANA timezone: {s}") from e
    return s


class _LogRowCore(BaseModel):
    """Shared structured fields for log rows (no source_type)."""

    model_config = ConfigDict(extra="ignore")

    start_time: str | None = None
    end_time: str | None = None
    event: str | None = None
    energy_level: int | None = None
    anxiety: int | None = None
    contentment: int | None = None
    focus: int | None = None
    music: str | None = None
    comments: str | None = None

    @field_validator("energy_level", mode="before")
    @classmethod
    def energy_level_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3) else None

    @field_validator("anxiety", mode="before")
    @classmethod
    def anxiety_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (0, 1, 2, 3) else None

    @field_validator("contentment", mode="before")
    @classmethod
    def contentment_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3) else None

    @field_validator("focus", mode="before")
    @classmethod
    def focus_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3, 4, 5) else None

    @field_validator("music", mode="before")
    @classmethod
    def music_options(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        s = str(v).strip()
        for allowed in MUSIC_VALUES:
            if s == allowed:
                return allowed
        return s


class ExtractLogsRow(_LogRowCore):
    """Row returned by /extract-logs. source_type is set only when saving (voice/text/manual)."""


class LogRowBase(_LogRowCore):
    source_type: Literal["manual", "voice", "text", "import"] = "manual"

    @field_validator("source_type", mode="before")
    @classmethod
    def normalize_source_type(cls, v: Any) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "manual"
        s = str(v).strip().lower()
        return s if s in ("manual", "voice", "text", "import") else "manual"


def _coerce_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.strip() == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


class ExtractLogsRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    log_date: date
    capture_time_local: str | None = Field(
        None,
        description="User's local wall-clock time when they requested extraction (24h HH:MM).",
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
    )
    timezone: str | None = Field(
        None,
        description="IANA timezone for log_date and capture_time_local context (e.g. America/Los_Angeles).",
        max_length=64,
    )

    @field_validator("timezone", mode="before")
    @classmethod
    def extract_tz_optional(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return validate_iana_timezone(str(v))


class ExtractDayContext(BaseModel):
    """Day-level tracker fields extracted from the transcript (not timed events)."""

    model_config = ConfigDict(extra="ignore")

    cycle_day: int | None = Field(None, ge=1, le=366)
    sleep_hours: float | None = Field(None, ge=0, le=24)
    sleep_quality: int | None = Field(None, ge=1, le=5)

    @field_validator("cycle_day", mode="before")
    @classmethod
    def empty_cycle_to_none(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return int(v)

    @field_validator("sleep_hours", mode="before")
    @classmethod
    def empty_sleep_hours(cls, v: Any) -> float | None:
        if v is None or v == "":
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return float(v)

    @field_validator("sleep_quality", mode="before")
    @classmethod
    def empty_sleep_quality(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return int(v)


class ExtractLogsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    transcript_summary: str
    rows: list[ExtractLogsRow]
    day_context: ExtractDayContext | None = None


class SaveLogsRequest(BaseModel):
    log_date: date
    rows: list[LogRowBase]


class LogImportRowIn(BaseModel):
    """One CSV line or JSON row for bulk import (server sets source_type to import on save)."""

    model_config = ConfigDict(extra="ignore")

    log_date: date
    start_time: str | None = None
    end_time: str | None = None
    event: str | None = None
    energy_level: int | None = None
    anxiety: int | None = None
    contentment: int | None = None
    focus: int | None = None
    music: str | None = None
    comments: str | None = None
    cycle_day: int | None = Field(None, ge=1, le=366)
    sleep_hours: float | None = Field(None, ge=0, le=24)
    sleep_quality: int | None = Field(None, ge=1, le=5)

    @field_validator("energy_level", mode="before")
    @classmethod
    def energy_level_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3) else None

    @field_validator("anxiety", mode="before")
    @classmethod
    def anxiety_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (0, 1, 2, 3) else None

    @field_validator("contentment", mode="before")
    @classmethod
    def contentment_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3) else None

    @field_validator("focus", mode="before")
    @classmethod
    def focus_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3, 4, 5) else None

    @field_validator("music", mode="before")
    @classmethod
    def music_options(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        s = str(v).strip()
        for allowed in MUSIC_VALUES:
            if s == allowed:
                return s
        return None


class LogsImportPreviewResponse(BaseModel):
    rows: list[LogImportRowIn]
    parse_errors: list[str]
    row_count: int


class LogsImportCommitRequest(BaseModel):
    rows: list[LogImportRowIn]

    @field_validator("rows")
    @classmethod
    def cap_import_size(cls, v: list[LogImportRowIn]) -> list[LogImportRowIn]:
        if len(v) > 2000:
            raise ValueError("At most 2000 rows per import")
        return v


class LogEntryRead(LogRowBase):
    id: int
    user_id: int
    log_date: date
    created_at: datetime

    model_config = {"from_attributes": True}


class LogEntryPatch(BaseModel):
    """Partial update for PATCH /logs/{id}; only sent fields are applied."""

    model_config = ConfigDict(extra="forbid")

    start_time: str | None = None
    end_time: str | None = None
    event: str | None = None
    energy_level: int | None = None
    anxiety: int | None = None
    contentment: int | None = None
    focus: int | None = None
    music: str | None = None
    comments: str | None = None
    source_type: Literal["manual", "voice", "text", "import"] | None = None
    log_date: date | None = None

    @field_validator("energy_level", mode="before")
    @classmethod
    def energy_level_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3) else None

    @field_validator("anxiety", mode="before")
    @classmethod
    def anxiety_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (0, 1, 2, 3) else None

    @field_validator("contentment", mode="before")
    @classmethod
    def contentment_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3) else None

    @field_validator("focus", mode="before")
    @classmethod
    def focus_scale(cls, v: Any) -> int | None:
        n = _coerce_int(v)
        if n is None:
            return None
        return n if n in (1, 2, 3, 4, 5) else None

    @field_validator("music", mode="before")
    @classmethod
    def music_options(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        s = str(v).strip()
        for allowed in MUSIC_VALUES:
            if s == allowed:
                return allowed
        return s

    @field_validator("source_type", mode="before")
    @classmethod
    def normalize_source_type(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        s = str(v).strip().lower()
        if s not in ("manual", "voice", "text", "import"):
            raise ValueError("source_type must be manual, voice, text, or import")
        return s


class TrackerDayRead(BaseModel):
    user_id: int
    log_date: date
    cycle_day: int | None = None
    sleep_hours: float | None = None
    sleep_quality: int | None = None

    model_config = {"from_attributes": True}


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    timezone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserTimezoneUpdate(BaseModel):
    """``timezone`` null clears the saved override (client uses device/browser zone)."""

    timezone: str | None = Field(
        ...,
        description="IANA timezone, or null to follow the browser default on the client.",
    )

    @field_validator("timezone", mode="before")
    @classmethod
    def tz_optional(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not str(v).strip()):
            return None
        return validate_iana_timezone(str(v))


class TrackerDayUpsert(BaseModel):
    log_date: date
    cycle_day: int | None = Field(None, ge=1, le=366)
    sleep_hours: float | None = Field(None, ge=0, le=24)
    sleep_quality: int | None = Field(None, ge=1, le=5)

    @field_validator("cycle_day", mode="before")
    @classmethod
    def empty_cycle_to_none(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return int(v)

    @field_validator("sleep_hours", mode="before")
    @classmethod
    def empty_sleep_hours(cls, v: Any) -> float | None:
        if v is None or v == "":
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return float(v)

    @field_validator("sleep_quality", mode="before")
    @classmethod
    def empty_sleep_quality(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return int(v)


# --- Insights (GET /insights) ---


class InsightsSummary(BaseModel):
    entry_count: int
    days_with_entries: int
    avg_energy: float | None = None
    avg_anxiety: float | None = None
    avg_contentment: float | None = None
    avg_focus: float | None = None


class InsightsDailyPoint(BaseModel):
    log_date: date
    entry_count: int
    avg_energy: float | None = None
    avg_anxiety: float | None = None
    avg_contentment: float | None = None
    avg_focus: float | None = None


class InsightsRecentEntry(BaseModel):
    id: int
    log_date: date
    created_at: datetime
    event: str | None = None
    energy_level: int | None = None
    anxiety: int | None = None
    contentment: int | None = None
    focus: int | None = None
    source_type: str = "manual"

    @field_validator("source_type", mode="before")
    @classmethod
    def source_type_fallback(cls, v: Any) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "manual"
        return str(v).strip()


class InsightsEventPattern(BaseModel):
    event_label: str
    count: int
    avg_energy: float | None = None
    avg_anxiety: float | None = None
    avg_contentment: float | None = None
    avg_focus: float | None = None


class InsightsTrackerSummary(BaseModel):
    days_with_tracker: int
    has_data: bool
    avg_sleep_quality: float | None = None
    avg_cycle_day: float | None = None
    avg_sleep_hours: float | None = None


class InsightsTrackerDailyPoint(BaseModel):
    log_date: date
    sleep_quality: int | None = None
    cycle_day: int | None = None
    sleep_hours: float | None = None


class InsightsResponse(BaseModel):
    start_date: date
    end_date: date
    summary: InsightsSummary
    daily: list[InsightsDailyPoint]
    recent_entries: list[InsightsRecentEntry]
    event_patterns: list[InsightsEventPattern]
    tracker_summary: InsightsTrackerSummary
    tracker_daily: list[InsightsTrackerDailyPoint]
