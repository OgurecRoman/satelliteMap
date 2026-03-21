from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.tle_record import TLERecord


class TLERepository:
    def __init__(self, session: Session):
        self.session = session

    def list_records(self, active_only: bool = False) -> list[TLERecord]:
        stmt = select(TLERecord).order_by(TLERecord.created_at.desc())
        if active_only:
            stmt = stmt.where(TLERecord.is_active.is_(True))
        return list(self.session.execute(stmt).scalars().all())

    def deactivate_satellite_records(self, satellite_id: int) -> None:
        stmt = update(TLERecord).where(TLERecord.satellite_id == satellite_id).values(is_active=False)
        self.session.execute(stmt)

    def create(self, tle_record: TLERecord) -> TLERecord:
        self.session.add(tle_record)
        self.session.flush()
        return tle_record
