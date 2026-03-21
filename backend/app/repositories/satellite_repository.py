from __future__ import annotations

from collections import Counter

from sqlalchemy import asc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.satellite import Satellite


class SatelliteRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, satellite_id: int) -> Satellite | None:
        stmt = select(Satellite).options(selectinload(Satellite.latest_tle)).where(Satellite.id == satellite_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_norad_id(self, norad_id: str) -> Satellite | None:
        stmt = select(Satellite).options(selectinload(Satellite.latest_tle)).where(Satellite.norad_id == norad_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_filtered(
        self,
        *,
        country: str | None = None,
        operator: str | None = None,
        orbit_type: str | None = None,
        purpose: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Satellite]:
        stmt = self._build_filters(country, operator, orbit_type, purpose, search)
        stmt = stmt.order_by(asc(Satellite.id)).limit(limit).offset(offset)
        return list(self.session.execute(stmt).scalars().all())

    def list_all_filtered(
        self,
        *,
        country: str | None = None,
        operator: str | None = None,
        orbit_type: str | None = None,
        purpose: str | None = None,
        search: str | None = None,
    ) -> list[Satellite]:
        stmt = self._build_filters(country, operator, orbit_type, purpose, search).order_by(asc(Satellite.id))
        return list(self.session.execute(stmt).scalars().all())

    def count_filtered(
        self,
        *,
        country: str | None = None,
        operator: str | None = None,
        orbit_type: str | None = None,
        purpose: str | None = None,
        search: str | None = None,
    ) -> int:
        stmt = select(func.count(Satellite.id))
        stmt = self._apply_filters(stmt, country, operator, orbit_type, purpose, search)
        return int(self.session.execute(stmt).scalar_one())

    def available_filters(self) -> dict[str, list[str]]:
        def fetch_values(column):
            stmt = select(column).distinct().where(column.is_not(None)).order_by(column.asc())
            return [row[0] for row in self.session.execute(stmt).all() if row[0]]

        return {
            "countries": fetch_values(Satellite.country),
            "operators": fetch_values(Satellite.operator),
            "orbit_types": fetch_values(Satellite.orbit_type),
            "purposes": fetch_values(Satellite.purpose),
        }

    def group_by_field(self, field: str) -> list[tuple[str, int]]:
        column = getattr(Satellite, field)
        stmt = select(column, func.count(Satellite.id)).group_by(column).order_by(func.count(Satellite.id).desc(), column.asc())
        return [(value or "Unknown", count) for value, count in self.session.execute(stmt).all()]

    def distribution(self, satellites: list[Satellite], field: str) -> dict[str, int]:
        values = [getattr(item, field) or "Unknown" for item in satellites]
        return dict(sorted(Counter(values).items(), key=lambda x: (-x[1], x[0])))

    def _build_filters(
        self,
        country: str | None,
        operator: str | None,
        orbit_type: str | None,
        purpose: str | None,
        search: str | None,
    ):
        stmt = select(Satellite).options(selectinload(Satellite.latest_tle))
        return self._apply_filters(stmt, country, operator, orbit_type, purpose, search)

    def _apply_filters(self, stmt, country, operator, orbit_type, purpose, search):
        if country:
            stmt = stmt.where(Satellite.country.ilike(country))
        if operator:
            stmt = stmt.where(Satellite.operator.ilike(operator))
        if orbit_type:
            stmt = stmt.where(Satellite.orbit_type.ilike(orbit_type))
        if purpose:
            stmt = stmt.where(Satellite.purpose.ilike(purpose))
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Satellite.name.ilike(pattern),
                    Satellite.norad_id.ilike(pattern),
                    Satellite.country.ilike(pattern),
                    Satellite.operator.ilike(pattern),
                    Satellite.purpose.ilike(pattern),
                )
            )
        return stmt
