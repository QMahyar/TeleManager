from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from conftest import add_account


def _ss():
    return __import__("telemanager.schedules_service", fromlist=["schedules_service"])


def _persist_schedule(ss, *, account_ids: list[str], targets: list[str], status: str = "active") -> dict[str, Any]:
    schedule = ss.build_schedule(
        ss.ScheduleRequest(
            name="Daily hello",
            queue={
                "steps": [
                    {
                        "action_type": "send_message",
                        "account_ids": account_ids,
                        "targets": targets,
                        "message": "hi",
                    }
                ],
                "max_operations": 100,
            },
            recurrence={"interval_value": 5, "interval_unit": "minutes", "end_mode": "forever"},
        )
    )
    schedule["status"] = status
    schedules = ss.load_schedules()
    schedules[schedule["id"]] = schedule
    ss.save_schedules(schedules)
    return schedule


def test_scheduled_targets_by_account_unions_and_skips_terminal(app_context: dict) -> None:
    ss = _ss()
    _persist_schedule(ss, account_ids=["acc-1"], targets=["@a", "@b"])
    _persist_schedule(ss, account_ids=["acc-1", "acc-2"], targets=["@c"])
    _persist_schedule(ss, account_ids=["acc-3"], targets=["@gone"], status="completed")

    mapping = ss.scheduled_targets_by_account()
    assert mapping["acc-1"] == {"@a", "@b", "@c"}
    assert mapping["acc-2"] == {"@c"}
    # Completed schedules hold nothing on Telegram's side anymore.
    assert "acc-3" not in mapping


def test_scheduled_overview_groups_chats_with_messages(app_context: dict, monkeypatch) -> None:
    ss = _ss()
    add_account(app_context, "acc-1", "Primary")
    service = app_context["main"].scheduler
    _persist_schedule(ss, account_ids=["acc-1"], targets=["@a", "@b"])

    async def fake_fetch(_client, target):
        if target == "@a":
            return [{"id": 1, "date": ss.iso(ss.utcnow()), "text": "hi"}]
        return []  # @b has nothing scheduled -> dropped from the overview

    @asynccontextmanager
    async def fake_temp(_account_id):
        yield object()

    monkeypatch.setattr(ss, "fetch_scheduled_messages", fake_fetch)
    monkeypatch.setattr(service.manager, "temp_client", fake_temp)

    overview = asyncio.run(service.scheduled_overview())
    accounts = overview["accounts"]
    assert len(accounts) == 1
    assert accounts[0]["label"] == "Primary"
    chats = accounts[0]["chats"]
    assert [chat["target"] for chat in chats] == ["@a"]
    assert chats[0]["count"] == 1
    assert "owned" in chats[0]["messages"][0]


def test_scheduled_overview_reports_unreachable_account(app_context: dict, monkeypatch) -> None:
    ss = _ss()
    add_account(app_context, "acc-1", "Primary")
    service = app_context["main"].scheduler
    _persist_schedule(ss, account_ids=["acc-1"], targets=["@a"])

    @asynccontextmanager
    async def boom(_account_id):
        raise ValueError("Session is not authorized. Log in again.")
        yield  # pragma: no cover - keeps this an async generator

    monkeypatch.setattr(service.manager, "temp_client", boom)

    overview = asyncio.run(service.scheduled_overview())
    account = overview["accounts"][0]
    assert account["chats"] == []
    assert "not authorized" in account["error"]
