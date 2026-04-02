from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_user_id
from app.models import User
from app.services.logs_csv_export import (
    MAX_EXPORT_RANGE_DAYS,
    build_export_filename,
    build_logs_csv,
)

router = APIRouter()


@router.get("/logs-csv")
def export_logs_csv(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_user_id),
):
    """
    Download log rows for the authenticated user (X-User-Id) as CSV.
    """
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    if (end_date - start_date).days > MAX_EXPORT_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range cannot exceed {MAX_EXPORT_RANGE_DAYS} days",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    body = build_logs_csv(db, user_id, start_date, end_date)
    filename = build_export_filename(user, start_date, end_date)

    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
