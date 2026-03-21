from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.tle import TLERecordBrief, TLEUpdateRequest, TLEUpdateResponse, TLEUploadResult
from app.services.tle_service import TLEService

router = APIRouter()


@router.post("/upload", response_model=TLEUploadResult, summary="Upload TLE file")
async def upload_tle(file: UploadFile = File(...), db: Session = Depends(get_db)):
    payload = await file.read()
    text = payload.decode("utf-8", errors="ignore")
    return TLEService(db).upload_from_text(text=text, source=file.filename or "upload")


@router.post("/seed", response_model=TLEUploadResult, summary="Load built-in TLE seed dataset")
def load_seed(db: Session = Depends(get_db)):
    return TLEService(db).load_seed_data()


@router.get("", response_model=list[TLERecordBrief], summary="List TLE records")
def list_tle_records(active_only: bool = Query(default=True), db: Session = Depends(get_db)):
    records = TLEService(db).list_records(active_only=active_only)
    return [TLERecordBrief(**item) for item in records]


@router.put("/{satellite_id}", response_model=TLEUpdateResponse, summary="Update current TLE for a satellite")
def update_tle(satellite_id: int, payload: TLEUpdateRequest, db: Session = Depends(get_db)):
    return TLEService(db).update_tle(
        satellite_id=satellite_id,
        line1=payload.line1,
        line2=payload.line2,
        source=payload.source,
    )
