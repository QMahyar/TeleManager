from __future__ import annotations

import asyncio
from typing import Any, cast

from conftest import add_account


def test_clear_chat_uses_just_clear_flag() -> None:
    """clear_chat must keep the dialog and only wipe history (just_clear=True)."""
    import telemanager.telegram_actions as actions

    captured: dict = {}

    class FakeClient:
        async def get_input_entity(self, target):
            return f"entity::{target}"

        async def __call__(self, request):
            captured["request"] = request
            return None

    async def run() -> str:
        return await actions.clear_chat(cast(Any, FakeClient()), "@somechat")

    detail = asyncio.run(run())
    request = captured["request"]
    assert getattr(request, "just_clear", None) is True
    assert getattr(request, "revoke", None) is False
    assert "cleared" in detail.lower()


def test_flood_wait_stops_queue_and_marks_remaining(app_context: dict) -> None:
    """A FloodWaitError aborts the run with flood_wait status and skips remaining ops."""
    from telethon.errors import FloodWaitError

    queue_service = __import__("telemanager.action_queue_service", fromlist=["action_queue_service"])
    add_account(app_context, "acc-1", "Primary")

    run = {
        "id": "run-flood",
        "results": [],
        "ok_count": 0,
        "failed_count": 0,
        "completed_count": 0,
    }
    op_current = {
        "account_id": "acc-1",
        "account_label": "Primary",
        "action_type": "send_message",
        "target": "@first",
        "step_index": 1,
        "status": "running",
    }
    op_remaining = {
        "account_id": "acc-1",
        "account_label": "Primary",
        "action_type": "send_message",
        "target": "@second",
        "step_index": 1,
        "status": "pending",
    }

    from telemanager.telegram_errors import classify_telegram_error

    flood = FloodWaitError(request=None)
    flood.seconds = 42
    # handle_queue_flood_wait takes a *classified* error (TelegramErrorInfo), as the
    # production caller passes — not a raw FloodWaitError.
    queue_service.handle_queue_flood_wait(
        run, op_current, [op_current, op_remaining], classify_telegram_error(flood)
    )

    assert run["status"] == "flood_wait"
    assert "42" in run["error"]
    assert op_current["status"] == "failed"
    assert op_remaining["status"] == "skipped_canceled"
    assert run["failed_count"] == 1


def test_flood_wait_status_is_terminal_for_history(app_context: dict, client) -> None:
    """A flood_wait run must not block clearing history (treated as terminal)."""
    main = app_context["main"]
    main.queue_runs["run-fw"] = {
        "id": "run-fw",
        "status": "flood_wait",
        "created_at": main.now_iso(),
    }

    response = client.delete("/api/actions/queue/runs")
    assert response.status_code == 200
    assert response.json()["removed"] >= 1
