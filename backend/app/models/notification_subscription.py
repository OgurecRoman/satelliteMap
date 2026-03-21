from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class NotificationSubscription(Base, TimestampMixin):
    __tablename__ = "notification_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    satellite_id: Mapped[int | None] = mapped_column(ForeignKey("satellites.id", ondelete="SET NULL"), nullable=True)
    point_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    point_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    region_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    region_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    filters_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    horizon_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    step_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    next_event_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    satellite = relationship("Satellite", back_populates="subscriptions")
