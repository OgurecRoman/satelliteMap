from __future__ import annotations

from dataclasses import dataclass

from sgp4.api import Satrec

from app.core.exceptions import BadRequestError


@dataclass(slots=True)
class ParsedTLE:
    name: str
    line1: str
    line2: str


def checksum_digit(line: str) -> int:
    total = 0
    for char in line[:68]:
        if char.isdigit():
            total += int(char)
        elif char == "-":
            total += 1
    return total % 10


def validate_tle_checksum(line: str) -> bool:
    line = line.rstrip()
    if len(line) < 69 or not line[-1].isdigit():
        return False
    return checksum_digit(line) == int(line[-1])


def norad_id_from_tle(line1: str) -> str:
    return line1[2:7].strip()


def validate_tle_pair(line1: str, line2: str) -> None:
    if not line1.startswith("1 ") or not line2.startswith("2 "):
        raise BadRequestError("Invalid TLE format: expected lines starting with '1 ' and '2 '")
    try:
        Satrec.twoline2rv(line1, line2)
    except Exception as exc:  # noqa: BLE001
        raise BadRequestError(f"Invalid TLE: {exc}") from exc


def parse_tle_text(text: str) -> list[ParsedTLE]:
    raw_lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    if not raw_lines:
        raise BadRequestError("TLE file is empty")

    records: list[ParsedTLE] = []
    i = 0
    while i < len(raw_lines):
        current = raw_lines[i]
        if current.startswith("1 "):
            if i + 1 >= len(raw_lines):
                raise BadRequestError("Malformed TLE file: line 2 is missing")
            line1 = current
            line2 = raw_lines[i + 1]
            name = f"SAT-{norad_id_from_tle(line1)}"
            validate_tle_pair(line1, line2)
            records.append(ParsedTLE(name=name, line1=line1, line2=line2))
            i += 2
            continue

        if i + 2 >= len(raw_lines):
            raise BadRequestError("Malformed TLE file: expected name + 2 TLE lines")
        name = current
        line1 = raw_lines[i + 1]
        line2 = raw_lines[i + 2]
        validate_tle_pair(line1, line2)
        records.append(ParsedTLE(name=name, line1=line1, line2=line2))
        i += 3

    if not records:
        raise BadRequestError("No valid TLE entries were found")
    return records
