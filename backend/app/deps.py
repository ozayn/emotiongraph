from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User


def require_user_id(
    x_user_id: str | None = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> int:
    if x_user_id is None or not str(x_user_id).strip():
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    try:
        uid = int(str(x_user_id).strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid X-User-Id")
    if db.get(User, uid) is None:
        raise HTTPException(status_code=404, detail="User not found")
    return uid
