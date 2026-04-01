from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LogRowBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    start_time: str | None = None
    end_time: str | None = None
    event: str | None = None
    event_category: str | None = None
    energy_level: int | None = None
    anxiety: int | None = None
    contentment: int | None = None
    focus: int | None = None
    music: str | None = None
    comments: str | None = None

    @field_validator(
        "energy_level",
        "anxiety",
        "contentment",
        "focus",
        mode="before",
    )
    @classmethod
    def empty_int_to_none(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, int):
            return v
        if isinstance(v, str) and v.strip() == "":
            return None
        return int(v)


class ExtractLogsRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    log_date: date


class ExtractLogsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    transcript_summary: str
    rows: list[LogRowBase]


class SaveLogsRequest(BaseModel):
    log_date: date
    rows: list[LogRowBase]


class LogEntryRead(LogRowBase):
    id: int
    log_date: date

    model_config = {"from_attributes": True}
