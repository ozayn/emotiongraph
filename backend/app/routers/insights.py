from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_user_id
from app.schemas import InsightsResponse
from app.services.insights import MAX_RANGE_DAYS, build_insights_payload

router = APIRouter()


@router.get("", response_model=InsightsResponse)
def get_insights(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    if (end_date - start_date).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range cannot exceed {MAX_RANGE_DAYS} days",
        )
    payload = build_insights_payload(db, user_id, start_date, end_date)
    return InsightsResponse.model_validate(payload)
