from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.schemas.common import HealthResponse
from app.core.config import get_settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse, summary="Health check")
def healthcheck():
    settings = get_settings()
    db: Session = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    finally:
        db.close()
    return HealthResponse(
        status="ok",
        database=database,
        timestamp=datetime.now(timezone.utc),
        version=settings.app_version,
    )
