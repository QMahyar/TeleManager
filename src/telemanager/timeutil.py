"""UTC time helpers — the single source of truth for stored/parsed timestamps.

Extracted from schedules_service so the recurrence math (and anything else) can
depend on them without importing the scheduler. schedules_service re-exports these
names, so existing ``schedules_service.utcnow`` / ``.iso`` / ``.parse_iso`` callers
keep working unchanged.
"""
from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
