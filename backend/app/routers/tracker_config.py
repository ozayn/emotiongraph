from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.deps import require_admin_user
from app.db import get_db
from app.schemas_tracker_config import (
    FieldDefinitionPatch,
    FieldDefinitionRead,
    SelectOptionPatch,
    SelectOptionRead,
    TrackerConfigResponse,
)
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
