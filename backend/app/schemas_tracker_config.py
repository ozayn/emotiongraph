from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SelectOptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_definition_id: int
    value: str
    label: str
    display_order: int
    is_active: bool


class FieldDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_builtin: bool
    key: str
    label: str
    scope: Literal["entry", "day"]
    field_type: Literal["text", "textarea", "select", "number", "time"]
    is_required: bool
    is_active: bool
    display_order: int
    options: list[SelectOptionRead] = Field(default_factory=list)


class TrackerConfigResponse(BaseModel):
    """Bundle for admin UI and future dynamic forms."""

    fields: list[FieldDefinitionRead]


class FieldDefinitionPatch(BaseModel):
    label: str | None = None
    is_required: bool | None = None
    is_active: bool | None = None
    display_order: int | None = None


class SelectOptionPatch(BaseModel):
    label: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class SelectOptionInitial(BaseModel):
    value: str = Field(..., max_length=256)
    label: str = Field(..., max_length=512)
    display_order: int = 0


class FieldDefinitionCreate(BaseModel):
    """Admin-created custom field (Phase 1: text, number, select only)."""

    scope: Literal["entry", "day"]
    field_type: Literal["text", "number", "select"]
    label: str = Field(..., min_length=1, max_length=256)
    is_required: bool = False
    is_active: bool = True
    display_order: int | None = None
    initial_options: list[SelectOptionInitial] = Field(default_factory=list)


class SelectOptionCreate(BaseModel):
    value: str = Field(..., max_length=256)
    label: str = Field(..., max_length=512)
    display_order: int = 0
    is_active: bool = True
