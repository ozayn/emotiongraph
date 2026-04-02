import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.deps import require_admin_user
from app.db import get_db
from app.schemas_tracker_config import (
    FieldDefinitionCreate,
    FieldDefinitionPatch,
    FieldDefinitionRead,
    SelectOptionCreate,
    SelectOptionPatch,
    SelectOptionRead,
    TrackerConfigResponse,
)
from app.services.tracker_custom_values import next_display_order_for_scope
from app.tracker_config_models import TrackerFieldDefinition, TrackerSelectOption

router = APIRouter(
    prefix="/tracker-config",
    tags=["tracker-config"],
    dependencies=[Depends(require_admin_user)],
)


def _sort_field(f: TrackerFieldDefinition) -> tuple[str, int]:
    scope_order = 0 if f.scope == "entry" else 1
    return (scope_order, f.display_order, f.id)


@router.get("", response_model=TrackerConfigResponse)
def get_tracker_config(db: Session = Depends(get_db)):
    fields = (
        db.query(TrackerFieldDefinition)
        .options(joinedload(TrackerFieldDefinition.options))
        .all()
    )
    fields.sort(key=_sort_field)
    for f in fields:
        f.options.sort(key=lambda o: (o.display_order, o.id))
    return TrackerConfigResponse(fields=fields)


@router.post("/fields", response_model=FieldDefinitionRead)
def create_custom_field(body: FieldDefinitionCreate, db: Session = Depends(get_db)):
    if body.field_type != "select" and body.initial_options:
        raise HTTPException(status_code=400, detail="initial_options is only valid for select fields")
    key = "c_" + secrets.token_hex(8)
    order = body.display_order
    if order is None:
        order = next_display_order_for_scope(db, body.scope)
    row = TrackerFieldDefinition(
        is_builtin=False,
        key=key,
        label=body.label.strip(),
        scope=body.scope,
        field_type=body.field_type,
        is_required=body.is_required,
        is_active=body.is_active,
        display_order=order,
    )
    db.add(row)
    db.flush()
    if body.field_type == "select":
        for o in body.initial_options:
            db.add(
                TrackerSelectOption(
                    field_definition_id=row.id,
                    value=o.value,
                    label=o.label,
                    display_order=o.display_order,
                    is_active=True,
                )
            )
    db.commit()
    row = (
        db.query(TrackerFieldDefinition)
        .options(joinedload(TrackerFieldDefinition.options))
        .filter(TrackerFieldDefinition.id == row.id)
        .one()
    )
    row.options.sort(key=lambda o: (o.display_order, o.id))
    return row


@router.post("/fields/{field_id}/options", response_model=SelectOptionRead)
def create_select_option(
    field_id: int,
    body: SelectOptionCreate,
    db: Session = Depends(get_db),
):
    fd = db.get(TrackerFieldDefinition, field_id)
    if fd is None:
        raise HTTPException(status_code=404, detail="Field not found")
    if fd.is_builtin:
        raise HTTPException(status_code=400, detail="Cannot add options to built-in fields via this endpoint")
    if fd.field_type != "select":
        raise HTTPException(status_code=400, detail="Field is not a select field")
    opt = TrackerSelectOption(
        field_definition_id=fd.id,
        value=body.value,
        label=body.label,
        display_order=body.display_order,
        is_active=body.is_active,
    )
    db.add(opt)
    db.commit()
    db.refresh(opt)
    return opt


@router.patch("/fields/{field_id}", response_model=FieldDefinitionRead)
def patch_field_definition(
    field_id: int,
    body: FieldDefinitionPatch,
    db: Session = Depends(get_db),
):
    row = db.get(TrackerFieldDefinition, field_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Field not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    row = (
        db.query(TrackerFieldDefinition)
        .options(joinedload(TrackerFieldDefinition.options))
        .filter(TrackerFieldDefinition.id == field_id)
        .one()
    )
    row.options.sort(key=lambda o: (o.display_order, o.id))
    return row


@router.patch("/options/{option_id}", response_model=SelectOptionRead)
def patch_select_option(
    option_id: int,
    body: SelectOptionPatch,
    db: Session = Depends(get_db),
):
    row = db.get(TrackerSelectOption, option_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Option not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row
