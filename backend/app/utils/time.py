from __future__ import annotations

from datetime import datetime, timedelta, timezone


def ensure_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iter_time_range(start_time: datetime, end_time: datetime, step_seconds: int):
    current = ensure_utc(start_time)
    end = ensure_utc(end_time)
    step = timedelta(seconds=step_seconds)
    while current <= end:
        yield current
        current += step
