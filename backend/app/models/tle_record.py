from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TLERecord(Base, TimestampMixin):
    __tablename__ = "tle_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id", ondelete="CASCADE"), index=True)
    name_in_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(255), nullable=False, default="unknown")
    line1: Mapped[str] = mapped_column(Text, nullable=False)
    line2: Mapped[str] = mapped_column(Text, nullable=False)
    epoch: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    checksum_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    satellite = relationship("Satellite", back_populates="tle_records", foreign_keys=[satellite_id])
