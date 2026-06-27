"""Recurrence math — pure functions over a recurrence dict, no I/O.

Extracted from schedules_service for focused unit testing (anchor in the past,
``start == until``, stagger vs interval, runaway-interval capping). schedules_service
re-exports these names, so existing ``schedules_service.upcoming_fire_times`` etc.
callers and tests keep working unchanged.

A "recurrence" dict has: ``interval_value`` (int), ``interval_unit`` (minutes/hours/
days), optional ``start_at`` (ISO), ``end_mode`` (count/until/forever), ``end_count``,
``end_until`` (ISO).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .timeutil import parse_iso

UNIT_SECONDS = {"minutes": 60, "hours": 3600, "days": 86400}

# Telegram only schedules messages 365 days out; keep a small safety margin. This is
# the furthest ahead recurrence projection / native buffering will ever look.
NATIVE_HORIZON = timedelta(days=364)


def interval_delta(recurrence: dict[str, Any]) -> timedelta:
    seconds = UNIT_SECONDS[recurrence["interval_unit"]] * int(recurrence["interval_value"])
    return timedelta(seconds=seconds)


def total_planned(recurrence: dict[str, Any]) -> int | None:
    return int(recurrence["end_count"]) if recurrence.get("end_mode") == "count" else None


def compute_anchor(recurrence: dict[str, Any], created_at: datetime) -> datetime:
    start = parse_iso(recurrence.get("start_at"))
    if start:
        return start
    return created_at + interval_delta(recurrence)


def upcoming_fire_times(
    anchor: datetime,
    recurrence: dict[str, Any],
    after: datetime,
    horizon: datetime,
    limit: int,
) -> list[datetime]:
    """Fire times strictly after `after`, up to and including `horizon`, honoring
    the end condition (count/until), capped at `limit` items."""
    delta = interval_delta(recurrence)
    if delta.total_seconds() <= 0 or limit <= 0:
        return []
    delta_seconds = delta.total_seconds()
    diff = (after - anchor).total_seconds()
    k = 0 if diff < 0 else int(diff // delta_seconds) + 1
    count = total_planned(recurrence)
    until = parse_iso(recurrence.get("end_until"))
    times: list[datetime] = []
    while len(times) < limit:
        if count is not None and k >= count:
            break
        fire = anchor + k * delta
        if fire > horizon:
            break
        if until and fire > until:
            break
        if fire > after:
            times.append(fire)
        k += 1
    return times


def next_future_slot(anchor: datetime, recurrence: dict[str, Any], after: datetime) -> datetime | None:
    horizon = after + NATIVE_HORIZON + timedelta(days=2)
    times = upcoming_fire_times(anchor, recurrence, after, horizon, limit=1)
    return times[0] if times else None


def fires_elapsed(anchor: datetime, recurrence: dict[str, Any], instant: datetime) -> int:
    """How many fire slots have already passed at `instant` (bounded by the plan)."""
    delta = interval_delta(recurrence)
    until = parse_iso(recurrence.get("end_until"))
    effective = min(instant, until) if until else instant
    if effective < anchor:
        return 0
    elapsed = int((effective - anchor).total_seconds() // delta.total_seconds()) + 1
    count = total_planned(recurrence)
    return min(elapsed, count) if count is not None else elapsed


def native_horizon(recurrence: dict[str, Any], now: datetime) -> datetime:
    horizon = now + NATIVE_HORIZON
    until = parse_iso(recurrence.get("end_until"))
    return min(horizon, until) if until else horizon
