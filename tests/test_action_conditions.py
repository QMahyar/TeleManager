"""Tests for the #12 smart-queue condition evaluator + its schedule interaction."""
from __future__ import annotations

import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest

from telemanager.action_conditions import compare, evaluate_condition, match_unread
from telemanager.schedules_service import _step_is_native, classify_engine
from telemanager.timeutil import utcnow


def _run(coro):
    return asyncio.run(coro)


class _StubClient:
    """Minimal stand-in for a warmed Telethon client used by the evaluator. Only the
    methods resolve_full_entity / resolve_input_peer / get_messages reach are defined."""

    def __init__(self, *, participants_count=None, last_date=None, no_messages=False, exc=None):
        self._participants_count = participants_count
        self._last_date = last_date
        self._no_messages = no_messages
        self._exc = exc

    async def get_entity(self, target):
        if self._exc:
            raise self._exc
        return SimpleNamespace(participants_count=self._participants_count)

    async def get_input_entity(self, target):
        if self._exc:
            raise self._exc
        return object()

    async def get_messages(self, peer, limit):
        if self._no_messages:
            return []
        return [SimpleNamespace(date=self._last_date)]


def test_compare_truth_table():
    assert compare(5, "<", 10)
    assert not compare(10, "<", 10)
    assert compare(10, "<=", 10)
    assert compare(5, "==", 5)
    assert not compare(5, "==", 6)
    assert compare(5, "!=", 6)
    assert compare(11, ">", 10)
    assert not compare(10, ">", 10)
    assert compare(10, ">=", 10)


def test_compare_rejects_unknown_operator():
    with pytest.raises(ValueError):
        compare(1, "~", 2)


def test_member_count_met_runs():
    client = _StubClient(participants_count=5)
    run, reason = _run(
        evaluate_condition(None, client, "acc", "@group", {"field": "member_count", "op": "<", "value": 10})
    )
    assert run is True
    assert "member_count" in reason


def test_member_count_not_met_skips():
    client = _StubClient(participants_count=50)
    run, reason = _run(
        evaluate_condition(None, client, "acc", "@group", {"field": "member_count", "op": "<", "value": 10})
    )
    assert run is False
    assert "Skipped" in reason


def test_missing_metric_skips():
    # A user/peer with no participants_count → metric is None → skip (never run blind).
    client = _StubClient(participants_count=None)
    run, _ = _run(
        evaluate_condition(None, client, "acc", "@user", {"field": "member_count", "op": "<", "value": 10})
    )
    assert run is False


def test_lookup_error_skips():
    client = _StubClient(exc=RuntimeError("boom"))
    run, reason = _run(
        evaluate_condition(None, client, "acc", "@group", {"field": "member_count", "op": "<", "value": 10})
    )
    assert run is False
    assert "Skipped" in reason


def test_days_since_last_message():
    old = _StubClient(last_date=utcnow() - timedelta(days=100))
    run, _ = _run(
        evaluate_condition(None, old, "acc", "@chan", {"field": "days_since_last_message", "op": ">", "value": 90})
    )
    assert run is True

    recent = _StubClient(last_date=utcnow() - timedelta(days=10))
    run2, _ = _run(
        evaluate_condition(None, recent, "acc", "@chan", {"field": "days_since_last_message", "op": ">", "value": 90})
    )
    assert run2 is False


def test_no_messages_skips():
    client = _StubClient(no_messages=True)
    run, _ = _run(
        evaluate_condition(None, client, "acc", "@chan", {"field": "days_since_last_message", "op": ">", "value": 90})
    )
    assert run is False


def test_match_unread_by_username_and_id():
    payload = {"dialogs": [{"username": "Foo", "id": "-100123", "unread_count": 5}]}
    assert match_unread(payload, "@foo") == 5
    assert match_unread(payload, "-100123") == 5
    assert match_unread(payload, "@missing") is None


def test_condition_forces_runner_engine():
    step = {
        "action_type": "send_message",
        "message": "hi",
        "condition": {"field": "unread_count", "op": "==", "value": 0},
    }
    assert _step_is_native(step) is False
    engine, _ = classify_engine([step])
    assert engine == "runner"


def test_no_condition_stays_native():
    step = {"action_type": "send_message", "message": "hi", "condition": None}
    assert _step_is_native(step) is True
