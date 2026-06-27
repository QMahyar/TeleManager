# pyright: reportMissingImports=false
"""Pure recurrence-math edge cases.

These import telemanager.recurrence directly — no app_context, no data dir, no
event loop. That isolation is the whole point of extracting recurrence.py from the
scheduler: the fire-time arithmetic is now testable on its own.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from telemanager.recurrence import (
    NATIVE_HORIZON,
    compute_anchor,
    fires_elapsed,
    interval_delta,
    native_horizon,
    next_future_slot,
    total_planned,
    upcoming_fire_times,
)
from telemanager.timeutil import iso

BASE = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _rec(
    *,
    interval_value: int = 1,
    interval_unit: str = "hours",
    start_at: str | None = None,
    end_mode: str = "forever",
    end_count: int | None = None,
    end_until: str | None = None,
) -> dict:
    return {
        "interval_value": interval_value,
        "interval_unit": interval_unit,
        "start_at": start_at,
        "end_mode": end_mode,
        "end_count": end_count,
        "end_until": end_until,
    }


def test_interval_delta_resolves_each_unit() -> None:
    assert interval_delta(_rec(interval_value=5, interval_unit="minutes")) == timedelta(minutes=5)
    assert interval_delta(_rec(interval_value=2, interval_unit="hours")) == timedelta(hours=2)
    assert interval_delta(_rec(interval_value=3, interval_unit="days")) == timedelta(days=3)


def test_total_planned_only_for_count_mode() -> None:
    assert total_planned(_rec(end_mode="count", end_count=7)) == 7
    assert total_planned(_rec(end_mode="forever")) is None
    assert total_planned(_rec(end_mode="until", end_until=iso(BASE))) is None


def test_compute_anchor_prefers_explicit_start() -> None:
    anchor = compute_anchor(_rec(start_at=iso(BASE)), created_at=BASE - timedelta(days=9))
    assert anchor == BASE


def test_compute_anchor_defaults_to_created_plus_one_interval() -> None:
    anchor = compute_anchor(_rec(interval_value=2, interval_unit="hours"), created_at=BASE)
    assert anchor == BASE + timedelta(hours=2)


def test_upcoming_skips_elapsed_slots_for_a_past_anchor() -> None:
    # Anchor is 10h in the past; the first returned slot must be strictly after `after`,
    # never one of the slots that already fired.
    anchor = BASE - timedelta(hours=10)
    fires = upcoming_fire_times(
        anchor, _rec(interval_unit="hours"), after=BASE, horizon=BASE + timedelta(hours=5), limit=100
    )
    assert fires[0] == BASE + timedelta(hours=1)
    assert all(fire > BASE for fire in fires)
    assert len(fires) == 5  # +1h..+5h, horizon inclusive


def test_upcoming_is_empty_when_window_has_zero_length() -> None:
    # start == until: nothing can fire strictly after the start yet within the until bound.
    fires = upcoming_fire_times(
        BASE, _rec(end_mode="until", end_until=iso(BASE)), after=BASE, horizon=BASE + timedelta(hours=10), limit=100
    )
    assert fires == []


def test_upcoming_caps_a_runaway_interval_at_limit() -> None:
    # 1-minute forever interval over a long horizon would be unbounded; `limit` caps it.
    fires = upcoming_fire_times(
        BASE, _rec(interval_value=1, interval_unit="minutes"), after=BASE, horizon=BASE + NATIVE_HORIZON, limit=50
    )
    assert len(fires) == 50


def test_upcoming_honors_count_end_mode() -> None:
    fires = upcoming_fire_times(
        BASE, _rec(interval_unit="hours", end_mode="count", end_count=3), after=BASE - timedelta(hours=1),
        horizon=BASE + timedelta(days=1), limit=100,
    )
    assert len(fires) == 3


def test_fires_elapsed_is_zero_before_anchor() -> None:
    assert fires_elapsed(BASE, _rec(), instant=BASE - timedelta(hours=1)) == 0


def test_fires_elapsed_is_bounded_by_count() -> None:
    elapsed = fires_elapsed(BASE, _rec(end_mode="count", end_count=2), instant=BASE + timedelta(hours=10))
    assert elapsed == 2


def test_fires_elapsed_is_bounded_by_until() -> None:
    # until clamps the effective instant, so slots after `until` don't count.
    elapsed = fires_elapsed(
        BASE,
        _rec(end_mode="until", end_until=iso(BASE + timedelta(hours=2))),
        instant=BASE + timedelta(hours=10),
    )
    assert elapsed == 3  # slots at +0h, +1h, +2h


def test_native_horizon_clamps_to_until() -> None:
    assert native_horizon(_rec(), now=BASE) == BASE + NATIVE_HORIZON
    clamped = native_horizon(_rec(end_mode="until", end_until=iso(BASE + timedelta(days=1))), now=BASE)
    assert clamped == BASE + timedelta(days=1)


def test_next_future_slot_returns_next_then_none_when_exhausted() -> None:
    nxt = next_future_slot(BASE, _rec(interval_unit="hours"), after=BASE + timedelta(minutes=30))
    assert nxt == BASE + timedelta(hours=1)
    exhausted = next_future_slot(BASE, _rec(end_mode="count", end_count=1), after=BASE + timedelta(hours=10))
    assert exhausted is None
