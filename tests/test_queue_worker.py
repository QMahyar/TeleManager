# pyright: reportMissingImports=false
"""Queue worker (process_action_queue) behavior under partial failure.

Drives the worker directly with a mocked run_warm_action so we assert the two
properties that matter for a guarded queue: one op failing doesn't abort the run,
and however a run ends it releases the session locks it held.
"""
from __future__ import annotations

import asyncio
import importlib

from conftest import add_account


def _qs():
    return importlib.import_module("telemanager.action_queue_service")


def _operation(account_id: str, label: str, target: str, step_index: int = 1) -> dict:
    return {
        "operation_id": f"{account_id}-{target}",
        "account_id": account_id,
        "account_label": label,
        "action_type": "send_message",
        "target": target,
        "step_index": step_index,
        "status": "pending",
        "started_at": None,
        "completed_at": None,
        "result": None,
        "message": "hi",
    }


def _run(run_id: str, expanded: list[dict]) -> dict:
    qs = _qs()
    return {
        "id": run_id,
        "status": "queued",
        "schedule_id": None,
        "created_at": qs.now_iso(),
        "updated_at": qs.now_iso(),
        "completed_at": None,
        "operation_count": len(expanded),
        "completed_count": 0,
        "ok_count": 0,
        "failed_count": 0,
        "current": None,
        "operations": expanded,
        "results": [],
        "error": None,
        "audit_event_id": None,
        "cancel_requested": False,
    }


def _request(qs):
    return qs.ActionQueueRequest(
        steps=[{"action_type": "send_message", "account_ids": ["acc-1"], "targets": ["@first"], "message": "hi"}]
    )


def test_queue_continues_after_single_op_failure(app_context: dict, monkeypatch) -> None:
    qs = _qs()
    actions = importlib.import_module("telemanager.telegram_actions")
    manager = app_context["main"].manager
    add_account(app_context, "acc-1", "Primary")

    async def no_delay(_seconds):  # keep the inter-op pause from actually sleeping
        return None

    monkeypatch.setattr(qs, "safe_delay", no_delay)

    # First op fails (ok=False), second succeeds — a single failure must not break the loop.
    outcomes = iter(
        [
            actions.TelegramActionResult("acc-1", "Primary", False, "send_message", "boom"),
            actions.TelegramActionResult("acc-1", "Primary", True, "send_message", "sent"),
        ]
    )

    async def fake_run_warm_action(_action):
        return next(outcomes)

    monkeypatch.setattr(manager, "run_warm_action", fake_run_warm_action)

    expanded = [_operation("acc-1", "Primary", "@first"), _operation("acc-1", "Primary", "@second")]
    queue_runs = {"run-1": _run("run-1", expanded)}
    asyncio.run(qs.process_action_queue(manager, queue_runs, "run-1", _request(qs), expanded))

    run = queue_runs["run-1"]
    assert run["completed_count"] == 2  # both attempted; the loop didn't abort after op 1
    assert (run["ok_count"], run["failed_count"]) == (1, 1)
    assert run["status"] == "completed"
    assert [op["status"] for op in expanded] == ["failed", "ok"]


def test_failed_run_releases_session_locks(app_context: dict, monkeypatch) -> None:
    qs = _qs()
    manager = app_context["main"].manager
    add_account(app_context, "acc-1", "Primary")

    async def boom(_action):
        raise RuntimeError("network exploded mid-run")

    monkeypatch.setattr(manager, "run_warm_action", boom)

    expanded = [_operation("acc-1", "Primary", "@first")]
    queue_runs = {"run-x": _run("run-x", expanded)}
    asyncio.run(qs.process_action_queue(manager, queue_runs, "run-x", _request(qs), expanded))

    run = queue_runs["run-x"]
    # An exception from run_warm_action is handled per-op (classified, op marked
    # failed) and the run finishes rather than aborting — the queue's "fail the op,
    # keep going" contract (see action_queue_service per-op error handling).
    assert run["status"] == "completed"
    assert run["failed_count"] == 1
    assert expanded[0]["status"] == "failed"
    # Regression guard: a run whose ops error out must not leave the account's session
    # lock held, or every later run/schedule on that account would be blocked forever.
    assert manager.is_account_busy("acc-1") is False
