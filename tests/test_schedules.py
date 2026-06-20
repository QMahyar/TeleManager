from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import Any

from conftest import add_account


def _ss():
    return __import__("telemanager.schedules_service", fromlist=["schedules_service"])


def _recurrence(**overrides: Any) -> dict[str, Any]:
    base = {
        "interval_value": 5,
        "interval_unit": "minutes",
        "start_at": None,
        "end_mode": "forever",
        "end_count": None,
        "end_until": None,
    }
    base.update(overrides)
    return base


def test_upcoming_fire_times_respects_count_and_limit(app_context: dict) -> None:
    ss = _ss()
    now = ss.utcnow()
    anchor = now
    recurrence = _recurrence(interval_value=1, end_mode="count", end_count=3)

    fires = ss.upcoming_fire_times(anchor, recurrence, now, now + timedelta(days=1), limit=100)
    # anchor itself is not > now (after), so fires are slots 1..2 within the count of 3
    assert len(fires) == 2
    assert all(fire > now for fire in fires)

    forever = _recurrence(interval_value=1)
    cap = ss.TELEGRAM_SCHEDULED_PER_CHAT_LIMIT
    capped = ss.upcoming_fire_times(anchor, forever, now, now + ss.NATIVE_HORIZON, limit=cap)
    assert len(capped) == cap


def test_until_mode_stops_at_end(app_context: dict) -> None:
    ss = _ss()
    now = ss.utcnow()
    anchor = now
    until = now + timedelta(minutes=12)
    recurrence = _recurrence(interval_value=5, end_mode="until", end_until=ss.iso(until))

    fires = ss.upcoming_fire_times(anchor, recurrence, now, now + timedelta(days=1), limit=100)
    # slots at +5 and +10 are <= until; +15 is past it
    assert len(fires) == 2
    assert ss.next_future_slot(anchor, recurrence, now + timedelta(minutes=11)) is None


def test_fires_elapsed_counts_passed_slots(app_context: dict) -> None:
    ss = _ss()
    now = ss.utcnow()
    anchor = now - timedelta(minutes=11)
    recurrence = _recurrence(interval_value=5)
    # slots at anchor, +5, +10 have all passed by now
    assert ss.fires_elapsed(anchor, recurrence, now) == 3


def test_classify_engine_and_native_text(app_context: dict) -> None:
    ss = _ss()

    native, _ = ss.classify_engine([{"action_type": "send_message", "message": "hi"}])
    assert native == "native"

    plain_start, _ = ss.classify_engine([{"action_type": "start_bot", "message": ""}])
    assert plain_start == "native"

    referral_start, reason = ss.classify_engine([{"action_type": "start_bot", "message": "start=ref"}])
    assert referral_start == "runner"
    assert "start bot" in reason

    mixed, _ = ss.classify_engine(
        [{"action_type": "send_message", "message": "hi"}, {"action_type": "leave_chat", "message": None}]
    )
    assert mixed == "runner"

    assert ss.native_text_for_step({"action_type": "start_bot", "message": ""}) == "/start"
    assert ss.native_text_for_step({"action_type": "send_message", "message": "hello"}) == "hello"


def test_create_list_pause_resume_delete_schedule(app_context: dict, client) -> None:
    add_account(app_context, "acc-1", "Primary")

    body = {
        "name": "Daily hello",
        "queue": {
            "steps": [
                {"action_type": "send_message", "account_ids": ["acc-1"], "targets": ["@chat"], "message": "hi"}
            ],
            "max_operations": 10,
        },
        "recurrence": {"interval_value": 5, "interval_unit": "minutes", "end_mode": "count", "end_count": 3},
    }

    created = client.post("/api/schedules", json=body)
    assert created.status_code == 200
    schedule = created.json()["schedule"]
    assert schedule["engine"] == "native"
    assert schedule["fires_planned"] == 3
    schedule_id = schedule["id"]

    listing = client.get("/api/schedules")
    assert any(item["id"] == schedule_id for item in listing.json()["schedules"])

    paused = client.patch(f"/api/schedules/{schedule_id}", json={"status": "paused"})
    assert paused.json()["schedule"]["status"] == "paused"

    resumed = client.patch(f"/api/schedules/{schedule_id}", json={"status": "active"})
    assert resumed.json()["schedule"]["status"] == "active"

    deleted = client.delete(f"/api/schedules/{schedule_id}")
    assert deleted.status_code == 200
    assert client.get(f"/api/schedules/{schedule_id}").status_code == 404


def test_schedule_preview_reports_engine_and_warnings(app_context: dict, client) -> None:
    add_account(app_context, "acc-1", "Primary")

    runner_body = {
        "name": "Hourly join",
        "queue": {
            "steps": [
                {"action_type": "leave_chat", "account_ids": ["acc-1"], "targets": ["@group"]}
            ],
            "max_operations": 10,
        },
        "recurrence": {"interval_value": 1, "interval_unit": "hours", "end_mode": "forever"},
    }
    preview = client.post("/api/schedules/preview", json=runner_body)
    assert preview.status_code == 200
    payload = preview.json()
    assert payload["engine"] == "runner"
    assert any("only fires while" in warning for warning in payload["warnings"])


def test_run_now_without_authorized_account_is_rejected(app_context: dict, client) -> None:
    add_account(app_context, "acc-login", "Needs Login", authorized=False)

    body = {
        "name": "Manual fire",
        "queue": {
            "steps": [
                {"action_type": "send_message", "account_ids": ["acc-login"], "targets": ["@chat"], "message": "hi"}
            ],
            "max_operations": 10,
        },
        "recurrence": {"interval_value": 5, "interval_unit": "minutes", "end_mode": "forever"},
    }
    schedule_id = client.post("/api/schedules", json=body).json()["schedule"]["id"]

    response = client.post(f"/api/schedules/{schedule_id}/run-now")
    assert response.status_code == 400


def test_native_reconcile_fills_buffer_and_dedupes(app_context: dict, monkeypatch) -> None:
    ss = _ss()
    service = ss.SchedulerService(app_context["main"].manager, {})

    existing: dict[int, Any] = {}
    created: list[Any] = []
    next_id = {"value": 1000}

    async def fake_list(_client, _target):
        return dict(existing)

    async def fake_create(_client, _target, _text, when):
        message_id = next_id["value"]
        next_id["value"] += 1
        existing[message_id] = when
        created.append(when)
        return message_id

    monkeypatch.setattr(ss, "list_scheduled_message_times", fake_list)
    monkeypatch.setattr(ss, "create_scheduled_text", fake_create)

    now = ss.utcnow()
    recurrence = _recurrence(interval_value=1)
    cap = ss.TELEGRAM_SCHEDULED_PER_CHAT_LIMIT
    desired = ss.upcoming_fire_times(now, recurrence, now, now + ss.NATIVE_HORIZON, cap)
    native_chats: dict[str, Any] = {}

    coverage = asyncio.run(service._reconcile_chat(object(), native_chats, "k1", "@chat", "hi", desired))
    assert len(created) == cap
    assert coverage is not None

    created.clear()
    asyncio.run(service._reconcile_chat(object(), native_chats, "k1", "@chat", "hi", desired))
    assert created == []  # already buffered, nothing new and no room left
