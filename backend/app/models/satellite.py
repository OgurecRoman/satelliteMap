from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Satellite(Base, TimestampMixin):
    __tablename__ = "satellites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    norad_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    country: Mapped[str] = mapped_column(String(128), nullable=False, default="Unknown", index=True)
    operator: Mapped[str] = mapped_column(String(255), nullable=False, default="Unknown", index=True)
    orbit_type: Mapped[str] = mapped_column(String(32), nullable=False, default="LEO", index=True)
    purpose: Mapped[str] = mapped_column(String(255), nullable=False, default="Unknown", index=True)
    approx_altitude_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    period_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_tle_id: Mapped[int | None] = mapped_column(
        ForeignKey("tle_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    tle_records = relationship(
        "TLERecord",
        back_populates="satellite",
        cascade="all, delete-orphan",
        foreign_keys="TLERecord.satellite_id",
    )
    latest_tle = relationship("TLERecord", foreign_keys=[latest_tle_id], post_update=True)
    subscriptions = relationship("NotificationSubscription", back_populates="satellite")
