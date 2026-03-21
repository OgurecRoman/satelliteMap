from __future__ import annotations

import json
from pathlib import Path

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
        payload = json.loads(seed_path.read_text(encoding="utf-8"))
        created_satellites = 0
        updated_satellites = 0
        created_tle_records = 0
        invalid_entries: list[str] = []

        for item in payload:
            try:
                validate_tle_pair(item["line1"], item["line2"])
                result = self._upsert_satellite_with_tle(
                    ParsedTLE(name=item["name"], line1=item["line1"], line2=item["line2"]),
                    source=item.get("source", "seed"),
                    metadata={
                        "country": item.get("country", "Unknown"),
                        "operator": item.get("operator", "Unknown"),
                        "purpose": item.get("purpose", "Unknown"),
                    },
                )
                created_satellites += int(result == "created")
                updated_satellites += int(result == "updated")
                created_tle_records += 1
            except Exception as exc:  # noqa: BLE001
                invalid_entries.append(f"{item.get('name', 'unknown')}: {exc}")

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

    def _upsert_satellite_with_tle(self, record: ParsedTLE, source: str, metadata: dict) -> str:
        line1 = record.line1
        line2 = record.line2
        validate_tle_pair(line1, line2)
        norad_id = norad_id_from_tle(line1)
        checksum_valid = validate_tle_checksum(line1) and validate_tle_checksum(line2)
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
                orbit_type=PropagationService.determine_orbit_type(line2),
                approx_altitude_km=PropagationService.approx_altitude_km(line2),
                period_minutes=PropagationService.orbital_period_minutes(line2),
            )
            self.session.add(satellite)
            self.session.flush()
        else:
            satellite.name = record.name or satellite.name
            satellite.country = metadata.get("country", satellite.country)
            satellite.operator = metadata.get("operator", satellite.operator)
            satellite.purpose = metadata.get("purpose", satellite.purpose)
            satellite.orbit_type = PropagationService.determine_orbit_type(line2)
            satellite.approx_altitude_km = PropagationService.approx_altitude_km(line2)
            satellite.period_minutes = PropagationService.orbital_period_minutes(line2)
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
