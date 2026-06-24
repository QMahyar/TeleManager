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

    async def fake_delay(_seconds):
        return None

    monkeypatch.setattr(ss, "list_scheduled_message_times", fake_list)
    monkeypatch.setattr(ss, "create_scheduled_text", fake_create)
    monkeypatch.setattr(ss, "safe_delay", fake_delay)

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


def test_recurrence_with_start_delay(app_context: dict) -> None:
    ss = _ss()
    now = ss.utcnow()
    future = now + timedelta(hours=1)
    recurrence = _recurrence(interval_value=20, end_mode="count", end_count=20, start_at=ss.iso(future))

    anchor = ss.compute_anchor(recurrence, now)
    assert anchor == future

    fires = ss.upcoming_fire_times(anchor, recurrence, now, now + timedelta(days=1), limit=100)
    assert len(fires) == 20
    assert fires[0] == future


def test_schedule_preview_marks_fully_offline(app_context: dict, client) -> None:
    from conftest import add_account

    add_account(app_context, "acc-1", "Primary")
    body = {
        "name": "Hi blast",
        "queue": {
            "steps": [
                {
                    "action_type": "send_message",
                    "account_ids": ["acc-1"],
                    "targets": ["@c1", "@c2", "@c3"],
                    "message": "hi",
                }
            ],
            "max_operations": 100,
        },
        "recurrence": {
            "interval_value": 20,
            "interval_unit": "minutes",
            "end_mode": "count",
            "end_count": 20,
        },
    }
    payload = client.post("/api/schedules/preview", json=body).json()
    assert payload["engine"] == "native"
    assert payload["fully_offline"] is True
    assert payload["total_messages"] == 60  # 20 fires x 3 chats


def test_inspect_and_clear_scheduled_messages(app_context: dict, monkeypatch) -> None:
    from contextlib import asynccontextmanager

    ss = _ss()
    service = app_context["main"].scheduler

    rows = [{"id": 1, "date": ss.iso(ss.utcnow()), "text": "hi"}, {"id": 2, "date": ss.iso(ss.utcnow()), "text": "hi"}]
    deleted: dict[str, Any] = {}

    async def fake_fetch(_client, _target):
        return [dict(row) for row in rows]

    async def fake_delete(_client, _target, ids):
        deleted["ids"] = list(ids)

    @asynccontextmanager
    async def fake_temp(_account_id):
        yield object()

    monkeypatch.setattr(ss, "fetch_scheduled_messages", fake_fetch)
    monkeypatch.setattr(ss, "delete_scheduled_messages", fake_delete)
    monkeypatch.setattr(service.manager, "temp_client", fake_temp)

    inspected = asyncio.run(service.inspect_scheduled("acc-1", "@chat"))
    assert inspected["count"] == 2
    assert all("owned" in row for row in inspected["messages"])

    cleared = asyncio.run(service.clear_scheduled("acc-1", "@chat", None))
    assert cleared["cleared"] == 2
    assert deleted["ids"] == [1, 2]


def test_fire_runner_skips_and_records_when_account_busy(app_context: dict, monkeypatch) -> None:
    # When an account a fire needs is already in use by another run, the fire is
    # skipped (start_action_queue is never called) and the reason is recorded; the
    # tick still advances next_fire_at to the next slot so nothing stacks up.
    ss = _ss()
    manager = app_context["main"].manager
    add_account(app_context, "acc-busy", "Busy One")
    service = ss.SchedulerService(manager, {})

    started: list[Any] = []
    monkeypatch.setattr(ss, "start_action_queue", lambda *a, **k: started.append(a))

    now = ss.utcnow()
    recurrence = _recurrence(interval_value=5)
    schedule = ss.build_schedule(
        ss.ScheduleRequest(
            name="Busy schedule",
            queue={
                "steps": [
                    {"action_type": "send_message", "account_ids": ["acc-busy"], "targets": ["@chat"], "message": "hi"}
                ],
                "max_operations": 10,
            },
            recurrence=recurrence,
        )
    )
    schedule["next_fire_at"] = ss.iso(now - timedelta(seconds=1))  # due now
    before_next = schedule["next_fire_at"]

    # Mark the account busy exactly as a live run would, then tick the runner.
    manager._busy_accounts.add("acc-busy")
    new_next = asyncio.run(service._tick_runner(schedule, now))

    assert started == []  # the fire was skipped, no run spawned
    assert "busy" in (schedule.get("last_error") or "").lower()
    assert "Busy One" in schedule["last_error"]  # account label surfaced
    assert new_next is not None and schedule["next_fire_at"] != before_next  # advanced
