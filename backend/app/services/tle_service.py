from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.satellite import Satellite
from app.models.tle_record import TLERecord
from app.repositories.satellite_repository import SatelliteRepository
from app.repositories.tle_repository import TLERepository
from app.schemas.tle import TLEUpdateResponse, TLEUploadResult
from app.services.propagation_service import PropagationService
from app.utils.tle import ParsedTLE, norad_id_from_tle, parse_tle_text, validate_tle_checksum, validate_tle_pair


class TLEService:
    def __init__(self, session: Session):
        self.session = session
        self.sat_repo = SatelliteRepository(session)
        self.tle_repo = TLERepository(session)

    def load_seed_data(self) -> TLEUploadResult:
        settings = get_settings()
        seed_path = Path(settings.seed_file_path)
        if not seed_path.exists():
            raise BadRequestError(f"Seed file not found: {seed_path}")

        try:
            payload = json.loads(seed_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise BadRequestError(f"Seed file is not valid JSON: {exc}") from exc

        if not isinstance(payload, list) or not payload:
            raise BadRequestError("Seed file must contain a non-empty JSON array")

        created_satellites = 0
        updated_satellites = 0
        created_tle_records = 0
        invalid_entries: list[str] = []

        for item in payload:
            try:
                parsed_record, source, metadata = self._parse_seed_item(item)
                result = self._upsert_satellite_with_tle(
                    record=parsed_record,
                    source=source,
                    metadata=metadata,
                )
                created_satellites += int(result == "created")
                updated_satellites += int(result == "updated")
                created_tle_records += 1
            except Exception as exc:  # noqa: BLE001
                item_name = item.get("name", "unknown") if isinstance(item, dict) else "unknown"
                invalid_entries.append(f"{item_name}: {exc}")

        self.session.commit()
        return TLEUploadResult(
            created_satellites=created_satellites,
            updated_satellites=updated_satellites,
            created_tle_records=created_tle_records,
            invalid_entries=invalid_entries,
        )

    def upload_from_text(self, text: str, source: str) -> TLEUploadResult:
        records = parse_tle_text(text)
        created_satellites = 0
        updated_satellites = 0
        created_tle_records = 0
        invalid_entries: list[str] = []

        for record in records:
            try:
                result = self._upsert_satellite_with_tle(record, source=source, metadata={})
                created_satellites += int(result == "created")
                updated_satellites += int(result == "updated")
                created_tle_records += 1
            except Exception as exc:  # noqa: BLE001
                invalid_entries.append(f"{record.name}: {exc}")

        if created_tle_records == 0:
            raise BadRequestError("Uploaded TLE file does not contain valid records")

        self.session.commit()
        return TLEUploadResult(
            created_satellites=created_satellites,
            updated_satellites=updated_satellites,
            created_tle_records=created_tle_records,
            invalid_entries=invalid_entries,
        )

    def list_records(self, active_only: bool = False):
        records = self.tle_repo.list_records(active_only=active_only)
        result = []
        for record in records:
            result.append(
                {
                    "id": record.id,
                    "satellite_id": record.satellite_id,
                    "satellite_name": record.satellite.name if record.satellite else "Unknown",
                    "norad_id": record.satellite.norad_id if record.satellite else "Unknown",
                    "source": record.source,
                    "epoch": record.epoch,
                    "is_active": record.is_active,
                    "checksum_valid": record.checksum_valid,
                }
            )
        return result

    def update_tle(self, satellite_id: int, line1: str, line2: str, source: str) -> TLEUpdateResponse:
        satellite = self.sat_repo.get(satellite_id)
        if not satellite:
            raise NotFoundError("Satellite not found")
        validate_tle_pair(line1, line2)
        checksum_valid = validate_tle_checksum(line1) and validate_tle_checksum(line2)
        self.tle_repo.deactivate_satellite_records(satellite.id)
        tle_record = TLERecord(
            satellite_id=satellite.id,
            name_in_source=satellite.name,
            source=source,
            line1=line1,
            line2=line2,
            epoch=PropagationService.tle_epoch(line1, line2),
            checksum_valid=checksum_valid,
            is_active=True,
        )
        self.tle_repo.create(tle_record)
        satellite.latest_tle_id = tle_record.id
        satellite.orbit_type = PropagationService.determine_orbit_type(line2)
        satellite.approx_altitude_km = PropagationService.approx_altitude_km(line2)
        satellite.period_minutes = PropagationService.orbital_period_minutes(line2)
        self.session.add(satellite)
        self.session.commit()
        self.session.refresh(tle_record)
        return TLEUpdateResponse(
            satellite_id=satellite.id,
            satellite_name=satellite.name,
            tle_record_id=tle_record.id,
            epoch=tle_record.epoch,
            orbit_type=satellite.orbit_type,
            approx_altitude_km=satellite.approx_altitude_km,
            period_minutes=satellite.period_minutes,
        )

    def _parse_seed_item(self, item: dict[str, Any]) -> tuple[ParsedTLE, str, dict[str, Any]]:
        if not isinstance(item, dict):
            raise BadRequestError("Each seed item must be a JSON object")

        name = self._clean_string(item.get("name"))
        if not name:
            raise BadRequestError("Seed item is missing 'name'")

        line1 = self._clean_string(item.get("tle_line1") or item.get("line1"))
        line2 = self._clean_string(item.get("tle_line2") or item.get("line2"))
        if not line1 or not line2:
            raise BadRequestError("Seed item is missing 'tle_line1'/'tle_line2' (or 'line1'/'line2')")

        validate_tle_pair(line1, line2)

        norad_from_tle = norad_id_from_tle(line1)
        norad_from_json = item.get("norad_id")
        if norad_from_json is not None and str(norad_from_json).strip() != norad_from_tle:
            raise BadRequestError(
                f"Seed norad_id '{norad_from_json}' does not match TLE norad_id '{norad_from_tle}'"
            )

        raw_metadata = item.get("metadata")
        if raw_metadata is not None and not isinstance(raw_metadata, dict):
            raise BadRequestError("Seed item 'metadata' must be an object")
        metadata = raw_metadata or {}

        normalized_metadata = {
            "country": self._clean_string(metadata.get("country")) or "Unknown",
            "operator": self._clean_string(metadata.get("operator")) or "Unknown",
            "purpose": self._clean_string(metadata.get("purpose")) or "Unknown",
        }

        normalized_orbit_type = self._normalize_orbit_type(metadata.get("orbit_type"))
        if normalized_orbit_type:
            normalized_metadata["orbit_type"] = normalized_orbit_type

        orbit_height = self._to_float(metadata.get("orbit_height_km"))
        if orbit_height is not None:
            normalized_metadata["approx_altitude_km"] = orbit_height

        period_minutes = self._to_float(metadata.get("period_min"))
        if period_minutes is not None:
            normalized_metadata["period_minutes"] = period_minutes

        inclination = self._to_float(metadata.get("inclination"))
        if inclination is not None:
            normalized_metadata["inclination"] = inclination

        parsed_record = ParsedTLE(name=name, line1=line1, line2=line2)
        source = self._clean_string(item.get("source")) or "seed"
        return parsed_record, source, normalized_metadata

    def _upsert_satellite_with_tle(self, record: ParsedTLE, source: str, metadata: dict[str, Any]) -> str:
        line1 = record.line1
        line2 = record.line2
        validate_tle_pair(line1, line2)
        norad_id = norad_id_from_tle(line1)
        checksum_valid = validate_tle_checksum(line1) and validate_tle_checksum(line2)

        resolved_orbit_type = metadata.get("orbit_type") or PropagationService.determine_orbit_type(line2)
        resolved_altitude = metadata.get("approx_altitude_km")
        if resolved_altitude is None:
            resolved_altitude = PropagationService.approx_altitude_km(line2)

        resolved_period = metadata.get("period_minutes")
        if resolved_period is None:
            resolved_period = PropagationService.orbital_period_minutes(line2)

        satellite = self.sat_repo.get_by_norad_id(norad_id)
        status = "updated"
        if satellite is None:
            status = "created"
            satellite = Satellite(
                name=record.name,
                norad_id=norad_id,
                country=metadata.get("country", "Unknown"),
                operator=metadata.get("operator", "Unknown"),
                purpose=metadata.get("purpose", "Unknown"),
                orbit_type=resolved_orbit_type,
                approx_altitude_km=resolved_altitude,
                period_minutes=resolved_period,
            )
            self.session.add(satellite)
            self.session.flush()
        else:
            satellite.name = record.name or satellite.name
            satellite.country = metadata.get("country", satellite.country)
            satellite.operator = metadata.get("operator", satellite.operator)
            satellite.purpose = metadata.get("purpose", satellite.purpose)
            satellite.orbit_type = resolved_orbit_type
            satellite.approx_altitude_km = resolved_altitude
            satellite.period_minutes = resolved_period
            self.tle_repo.deactivate_satellite_records(satellite.id)

        tle_record = TLERecord(
            satellite_id=satellite.id,
            name_in_source=record.name,
            source=source,
            line1=line1,
            line2=line2,
            epoch=PropagationService.tle_epoch(line1, line2),
            checksum_valid=checksum_valid,
            is_active=True,
        )
        self.tle_repo.create(tle_record)
        satellite.latest_tle_id = tle_record.id
        self.session.add(satellite)
        self.session.flush()
        return status

    @staticmethod
    def _clean_string(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_orbit_type(value: Any) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip().upper()
        allowed = {"LEO", "MEO", "GEO", "HEO", "UNKNOWN"}
        return normalized if normalized in allowed else None
