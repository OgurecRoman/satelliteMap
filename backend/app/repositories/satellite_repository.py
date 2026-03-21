from __future__ import annotations

from collections import Counter

from sqlalchemy import asc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.satellite import Satellite
from app.models.tle_record import TLERecord


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
        exact_search = self._should_use_exact_search(country, operator, orbit_type, purpose, search)
        stmt = self._build_filters(country, operator, orbit_type, purpose, search, exact_search=exact_search)
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
        exact_search = self._should_use_exact_search(country, operator, orbit_type, purpose, search)
        stmt = self._build_filters(country, operator, orbit_type, purpose, search, exact_search=exact_search).order_by(asc(Satellite.id))
        return list(self.session.execute(stmt).scalars().all())

    def list_position_rows_filtered(
        self,
        *,
        country: str | None = None,
        operator: str | None = None,
        orbit_type: str | None = None,
        purpose: str | None = None,
        search: str | None = None,
    ) -> list[tuple[int, str, str, str]]:
        exact_search = self._should_use_exact_search(country, operator, orbit_type, purpose, search)
        stmt = (
            select(Satellite.id, Satellite.name, TLERecord.line1, TLERecord.line2)
            .join(TLERecord, TLERecord.id == Satellite.latest_tle_id)
            .where(Satellite.latest_tle_id.is_not(None))
            .order_by(asc(Satellite.id))
        )
        stmt = self._apply_filters(stmt, country, operator, orbit_type, purpose, search, exact_search=exact_search)
        return list(self.session.execute(stmt).all())

    def count_filtered(
        self,
        *,
        country: str | None = None,
        operator: str | None = None,
        orbit_type: str | None = None,
        purpose: str | None = None,
        search: str | None = None,
    ) -> int:
        exact_search = self._should_use_exact_search(country, operator, orbit_type, purpose, search)
        stmt = select(func.count(Satellite.id))
        stmt = self._apply_filters(stmt, country, operator, orbit_type, purpose, search, exact_search=exact_search)
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
        *,
        exact_search: bool = False,
    ):
        stmt = select(Satellite).options(selectinload(Satellite.latest_tle))
        return self._apply_filters(stmt, country, operator, orbit_type, purpose, search, exact_search=exact_search)

    def _normalized_search(self, search: str | None) -> str | None:
        if search is None:
            return None
        value = search.strip()
        return value or None

    def _should_use_exact_search(
        self,
        country: str | None,
        operator: str | None,
        orbit_type: str | None,
        purpose: str | None,
        search: str | None,
    ) -> bool:
        normalized = self._normalized_search(search)
        if not normalized:
            return False

        stmt = select(func.count(Satellite.id))
        stmt = self._apply_filters(stmt, country, operator, orbit_type, purpose, None, exact_search=False)
        lower_value = normalized.lower()
        stmt = stmt.where(
            or_(
                func.lower(Satellite.name) == lower_value,
                func.lower(Satellite.norad_id) == lower_value,
            )
        )
        return int(self.session.execute(stmt).scalar_one()) > 0

    def _apply_filters(self, stmt, country, operator, orbit_type, purpose, search, *, exact_search: bool = False):
        if country:
            stmt = stmt.where(Satellite.country.ilike(country))
        if operator:
            stmt = stmt.where(Satellite.operator.ilike(operator))
        if orbit_type:
            stmt = stmt.where(Satellite.orbit_type.ilike(orbit_type))
        if purpose:
            stmt = stmt.where(Satellite.purpose.ilike(purpose))
        normalized = self._normalized_search(search)
        if normalized:
            if exact_search:
                lowered = normalized.lower()
                stmt = stmt.where(
                    or_(
                        func.lower(Satellite.name) == lowered,
                        func.lower(Satellite.norad_id) == lowered,
                    )
                )
            else:
                pattern = f"%{normalized}%"
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
