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
