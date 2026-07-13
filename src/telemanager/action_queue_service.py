from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .accounts import AccountManager
from .action_conditions import evaluate_condition
from .action_runs_service import save_action_runs
from .audit_service import log_event
from .config import now_iso
from .documents import safety_doc
from .telegram_actions import (
    MESSAGE_REQUIRED_ACTIONS,
    TelegramAction,
    TelegramActionResult,
    TelegramActionType,
    action_tier,
    safe_delay,
    validate_target_for_action,
)
from .telegram_errors import classify_telegram_error

logger = logging.getLogger("telemanager.queue")

# Fraction of the sensitive-tier delay added as random jitter, so identical
# back-to-back sensitive ops (and any synchronized retries across accounts) don't
# all hit Telegram at the exact same cadence — a documented FloodWait mitigation.
SENSITIVE_JITTER_FRACTION = 0.25

QUEUE_SAVE_INTERVAL_SECONDS = 2.0
# Per-operation ceiling so a single hung Telethon call (dead socket, unresponsive
# Telegram) can't stall the whole queue indefinitely. Generous enough for large
# media uploads; a hang beyond this fails just that operation and the queue continues.
QUEUE_OPERATION_TIMEOUT_SECONDS = 180.0
# How often a cancellable wait (pause gate, flood-wait auto-resume) re-checks the
# run's control flags. Small so cancel/resume feel immediate without busy-looping.
CONTROL_POLL_SECONDS = 1.0
TERMINAL_RUN_STATUSES = {"completed", "failed", "interrupted", "canceled", "flood_wait"}
# "Active" now covers the two operator-controllable waits (paused, flood_waiting) so
# clear/delete/retry guards still treat a parked run as live, not deletable.
ACTIVE_RUN_STATUSES = {"queued", "running", "canceling", "pausing", "paused", "flood_waiting"}

# The event loop only holds a weak reference to bare tasks, so a running queue can be
# garbage-collected mid-run. Keep a strong reference until the task finishes.
_background_tasks: set[asyncio.Task] = set()


class StepCondition(BaseModel):
    """A guard evaluated per-target at run time; the operation is skipped when it's
    false. Structured (not a free-text DSL) so no parser has to be kept in lockstep
    across backend + frontend — the three fields are all readable with one Telegram
    call (or the cached dialogs, for unread_count)."""

    field: Literal["member_count", "days_since_last_message", "unread_count"]
    op: Literal["<", "<=", "==", "!=", ">", ">="]
    value: float = Field(ge=0)


class ActionQueueStep(BaseModel):
    action_type: TelegramActionType
    targets: list[str] = Field(min_length=1, max_length=25)
    account_ids: list[str] = Field(min_length=1, max_length=25)
    message: str | None = Field(default=None, max_length=4096)
    condition: StepCondition | None = None

    @model_validator(mode="after")
    def validate_step(self) -> ActionQueueStep:
        clean_targets = [target.strip() for target in self.targets if target.strip()]
        if not clean_targets:
            raise ValueError("At least one target is required.")
        self.targets = clean_targets
        if self.action_type in MESSAGE_REQUIRED_ACTIONS and not (self.message or "").strip():
            raise ValueError("Message text is required for this action. Options may be required for advanced actions.")
        for target in self.targets:
            error = validate_target_for_action(self.action_type, target)
            if error:
                raise ValueError(error)
        return self


class ActionQueueRequest(BaseModel):
    steps: list[ActionQueueStep] = Field(min_length=1, max_length=20)
    confirm: bool = False
    # delay_between_actions doubles as the *standard*-tier delay (kept under its old
    # name for backward compatibility with saved presets/schedules). delay_instant
    # and delay_sensitive are the other two tiers; all default from safety settings.
    delay_between_accounts: float | None = Field(default=None, ge=1.0, le=60.0)
    delay_between_actions: float | None = Field(default=None, ge=1.0, le=120.0)
    delay_instant: float | None = Field(default=None, ge=0.0, le=120.0)
    delay_sensitive: float | None = Field(default=None, ge=1.0, le=120.0)
    max_operations: int | None = Field(default=None, ge=1, le=250)

    @model_validator(mode="after")
    def validate_queue(self) -> ActionQueueRequest:
        defaults = safety_defaults()
        # Explicit None checks (not `or`): delay_instant may legitimately be 0.
        if self.delay_between_accounts is None:
            self.delay_between_accounts = defaults["delay_between_accounts"]
        if self.delay_between_actions is None:
            self.delay_between_actions = defaults["delay_between_actions"]
        if self.delay_instant is None:
            self.delay_instant = defaults["delay_instant"]
        if self.delay_sensitive is None:
            self.delay_sensitive = defaults["delay_sensitive"]
        if self.max_operations is None:
            self.max_operations = defaults["max_operations"]
        operation_count = sum(len(step.account_ids) * len(step.targets) for step in self.steps)
        if operation_count > self.max_operations:
            raise ValueError(
                f"Queue has {operation_count} operations, above the configured limit of {self.max_operations}."
            )
        return self


class SafetySettingsRequest(BaseModel):
    delay_between_accounts: float = Field(default=4.0, ge=1.0, le=60.0)
    # Standard-tier delay. Retains the historical field name so settings/presets
    # saved before tiered timing keep loading unchanged (missing tier fields default).
    delay_between_actions: float = Field(default=8.0, ge=1.0, le=120.0)
    delay_instant: float = Field(default=1.0, ge=0.0, le=120.0)
    delay_sensitive: float = Field(default=12.0, ge=1.0, le=120.0)
    max_operations: int = Field(default=100, ge=1, le=250)
    # A flood wait at or below this cap is auto-waited and retried once in-place
    # instead of stopping the queue; beyond it, the run stops as before. 0 disables
    # auto-resume (any long flood stops the run). 900s = 15m default.
    flood_wait_resume_cap: int = Field(default=900, ge=0, le=86400)


def safety_defaults() -> dict:
    settings = safety_doc.read({})
    return SafetySettingsRequest(**settings).model_dump()


def save_safety_settings(request: SafetySettingsRequest) -> dict:
    settings = request.model_dump()
    safety_doc.write(settings)
    return settings


def start_action_queue(
    manager: AccountManager,
    queue_runs: dict[str, dict],
    request: ActionQueueRequest,
    schedule_id: str | None = None,
) -> dict:
    if not request.confirm:
        raise ValueError("Queue confirmation is required.")
    expanded = [operation for operation in expand_action_queue(manager, request) if operation.get("status") == "ready"]
    if not expanded:
        raise ValueError("No authorized accounts selected. Log in at least one selected account first.")

    run_id = str(uuid.uuid4())
    for index, operation in enumerate(expanded, start=1):
        operation["operation_id"] = f"{run_id}-{index}"
        operation["status"] = "pending"
        operation["started_at"] = None
        operation["completed_at"] = None
        operation["result"] = None
    queue_runs[run_id] = {
        "id": run_id,
        "status": "queued",
        "schedule_id": schedule_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "completed_at": None,
        "operation_count": len(expanded),
        "completed_count": 0,
        "ok_count": 0,
        "failed_count": 0,
        "skipped_count": 0,
        "current": None,
        "operations": expanded,
        "results": [],
        "error": None,
        "audit_event_id": None,
        "cancel_requested": False,
        "pause_requested": False,
        "resume_at": None,  # ISO time a flood-wait auto-resume is expected to end
    }
    save_action_runs(queue_runs)
    task = asyncio.create_task(process_action_queue(manager, queue_runs, run_id, request, expanded))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return {"run_id": run_id, "status": "queued", "operation_count": len(expanded)}


async def process_action_queue(
    manager: AccountManager,
    queue_runs: dict[str, dict],
    run_id: str,
    request: ActionQueueRequest,
    expanded: list[dict],
) -> None:
    run = queue_runs[run_id]
    run["status"] = "running"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    last_save = time.monotonic()

    def throttled_save() -> None:
        nonlocal last_save
        now = time.monotonic()
        if now - last_save >= QUEUE_SAVE_INTERVAL_SECONDS:
            save_action_runs(queue_runs)
            last_save = now

    delays = resolved_queue_delays(request)
    resume_cap = float(safety_defaults()["flood_wait_resume_cap"])
    run_account_ids = sorted({operation["account_id"] for operation in expanded})

    def cancel_now(remaining: list[dict], during: str = "before the next operation started") -> None:
        mark_remaining_operations(remaining)
        run["status"] = "canceled"
        run["error"] = f"Queue canceled {during}."

    # Hold the per-account session locks for the whole run so a `.session` file is
    # never opened by two runs at once (manual + scheduled, or two schedules). Runs
    # over disjoint accounts don't contend; same-account runs serialize here.
    async with manager.session_guard(run_account_ids):
        try:
            for index, operation in enumerate(expanded):
                if run.get("cancel_requested"):
                    cancel_now(expanded[index:])
                    break
                # Pause gate: park here (still holding the session locks) until the
                # operator resumes or cancels. ponytail: a paused run keeps its
                # accounts reserved on purpose — cancel to release them.
                await _wait_while_paused(queue_runs, run)
                if run.get("cancel_requested"):
                    cancel_now(expanded[index:])
                    break
                if index > 0:
                    previous = expanded[index - 1]
                    delay = inter_operation_delay(
                        previous["account_id"], operation["account_id"], operation["action_type"], delays
                    )
                    await safe_delay(delay)
                    # A cancel can land during the inter-op pause (up to 120s); honour it
                    # here too so the queue stops promptly instead of running one more
                    # operation. The op is still "pending", so it's marked skipped.
                    if run.get("cancel_requested"):
                        cancel_now(expanded[index:])
                        break
                operation["status"] = "running"
                operation["started_at"] = now_iso()
                run["current"] = operation
                run["updated_at"] = now_iso()
                throttled_save()

                # Smart-queue guard: when a step carries a condition, evaluate it
                # against this target with the warm client and skip the op if it's
                # not met (or can't be verified). Skips never count as failures.
                condition = operation.get("condition")
                if condition and not await _condition_passes(manager, run, operation, condition):
                    operation["result"] = _skip_payload(operation)
                    run["results"].append(operation["result"])
                    _update_run_counts(run)
                    run["updated_at"] = now_iso()
                    throttled_save()
                    continue

                action = TelegramAction(
                    action_type=operation["action_type"],
                    target=operation["target"],
                    account_ids=[operation["account_id"]],
                    message=operation.get("message"),
                    confirm=True,
                    delay_seconds=delays["accounts"],
                )
                try:
                    result_payload = await execute_operation(manager, queue_runs, run, operation, action, resume_cap)
                except _FloodStop as stop:
                    handle_queue_flood_wait(run, operation, expanded[index:], stop.error_info)
                    break
                except _QueueAborted:
                    # Cancel landed during a flood-wait auto-resume pause; this op never
                    # ran, so mark it (and the rest) skipped rather than failed.
                    operation["status"] = "skipped_canceled"
                    operation["completed_at"] = now_iso()
                    cancel_now(expanded[index + 1 :], during="during a flood-wait pause")
                    break
                result_payload["target"] = operation["target"]
                result_payload["step_index"] = operation["step_index"]
                operation["status"] = "ok" if result_payload["ok"] else "failed"
                operation["completed_at"] = now_iso()
                operation["result"] = result_payload
                run["results"].append(result_payload)
                _update_run_counts(run)
                run["updated_at"] = now_iso()
                throttled_save()
            # A cancel that lands during the final (or only) operation has no next
            # loop iteration to catch cancel_requested, so honour it here too — else
            # "canceling" is overwritten by "completed" and the operator's cancel is lost.
            if run.get("cancel_requested") and run.get("status") != "flood_wait":
                run["status"] = "canceled"
            elif run.get("status") not in {"canceled", "flood_wait"}:
                run["status"] = "completed"
            save_action_runs(queue_runs)
        except Exception as exc:
            # Log the traceback so an operator can diagnose from the logfile, not just
            # see "failed" with a one-line message in the audit UI.
            logger.exception("Action queue run %s failed", run_id)
            run["status"] = "failed"
            run["error"] = str(exc)
        finally:
            await manager.release_run_clients(run_account_ids)
            run["current"] = None
            run["completed_at"] = now_iso()
            run["updated_at"] = run["completed_at"]
            event = log_event(
                "telegram_action_queue",
                "Telegram action queue completed",
                f"{run['ok_count']}/{len(run['results'])} operations succeeded",
                {
                    "request": _audit_queue_request(request),
                    "results": run["results"],
                    "error": run["error"],
                },
            )
            run["audit_event_id"] = event["id"]
            save_action_runs(queue_runs)


class _FloodStop(Exception):
    """Raised by execute_operation for a flood wait beyond the auto-resume cap; the
    worker catches it, records the stop, and ends the run as flood_wait."""

    def __init__(self, error_info: Any) -> None:
        self.error_info = error_info


class _QueueAborted(Exception):
    """Raised when a cancel lands during a cancellable in-op wait (flood auto-resume),
    so the worker skips the in-flight op instead of failing it."""


def _iso_in(seconds: float) -> str:
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()


def _fail_payload(operation: dict, detail: str) -> dict:
    return TelegramActionResult(
        operation["account_id"], operation["account_label"], False, operation["action_type"], detail
    ).to_dict()


def _skip_payload(operation: dict, reason: str | None = None) -> dict:
    """Result row for an op skipped by its condition — ok=True + skipped=True so the
    run summary counts it as neither success nor failure."""
    operation["status"] = "skipped_condition"
    operation["completed_at"] = now_iso()
    return {
        "account_id": operation["account_id"],
        "label": operation.get("account_label") or operation["account_id"],
        "ok": True,
        "skipped": True,
        "action_type": operation["action_type"],
        "detail": reason or operation.get("_skip_reason", "Condition not met."),
        "target": operation["target"],
        "step_index": operation["step_index"],
    }


async def _condition_passes(manager: AccountManager, run: dict, operation: dict, condition: dict) -> bool:
    """Evaluate a step condition against this target; on any error, skip (never fail).
    Stashes the human reason on the operation for _skip_payload to read."""
    try:
        client = await manager.warm_client(operation["account_id"])
        should_run, reason = await evaluate_condition(
            manager, client, operation["account_id"], operation["target"], condition
        )
    except Exception as exc:
        should_run, reason = False, f"Skipped: {classify_telegram_error(exc).user_message}"
    operation["_skip_reason"] = reason
    return should_run


async def _wait_while_paused(queue_runs: dict[str, dict], run: dict) -> None:
    """Block while pause is requested, flipping the run to 'paused' and back to
    'running'. Returns immediately (and lets the caller's cancel check fire) if a
    cancel arrives while parked."""
    if not run.get("pause_requested"):
        return
    run["status"] = "paused"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    while run.get("pause_requested") and not run.get("cancel_requested"):
        await asyncio.sleep(CONTROL_POLL_SECONDS)
    if not run.get("cancel_requested"):
        run["status"] = "running"
        run["updated_at"] = now_iso()
        save_action_runs(queue_runs)


async def _cancellable_sleep(seconds: float, run: dict) -> bool:
    """Sleep up to `seconds`, re-checking the run's cancel flag every poll. Returns
    False the moment a cancel is seen, True if the full duration elapsed."""
    remaining = max(0.0, seconds)
    while remaining > 0:
        if run.get("cancel_requested"):
            return False
        step = min(CONTROL_POLL_SECONDS, remaining)
        await asyncio.sleep(step)
        remaining -= step
    return not run.get("cancel_requested")


def _auto_wait_seconds(error_info: Any, resume_cap: float) -> float | None:
    """Seconds to wait before one automatic in-place retry, or None to not retry.

    Short floods (<=60s) and transient network blips always get their brief retry;
    a longer flood is auto-waited only up to the operator's resume cap. Beyond the
    cap (or a non-retryable error) returns None so the caller stops or fails the op.
    """
    seconds = error_info.retry_after_seconds
    if seconds is None:
        return None
    if error_info.category.startswith("flood_wait"):
        if seconds <= 60:
            return float(seconds)
        return float(seconds) if seconds <= resume_cap else None
    return float(seconds) if (error_info.retryable and seconds <= 60) else None


async def _run_action_once(manager: AccountManager, action: TelegramAction) -> dict:
    result = await asyncio.wait_for(manager.run_warm_action(action), timeout=QUEUE_OPERATION_TIMEOUT_SECONDS)
    return result.to_dict()


async def execute_operation(
    manager: AccountManager,
    queue_runs: dict[str, dict],
    run: dict,
    operation: dict,
    action: TelegramAction,
    resume_cap: float,
) -> dict:
    """Run one queued operation and return its result payload.

    Applies the retry/flood policy in one place: a hard timeout fails fast (no retry —
    that was the bug where a hung op burned 2× the ceiling); a within-cap flood or a
    network blip is waited out (cancellably) and retried once; a beyond-cap flood
    raises _FloodStop so the caller stops the whole run.
    """
    try:
        return await _run_action_once(manager, action)
    except TimeoutError:
        logger.warning(
            "Queue %s: %s on %s timed out after %ss",
            run["id"], operation["action_type"], operation["account_id"], QUEUE_OPERATION_TIMEOUT_SECONDS,
        )
        return _fail_payload(operation, f"Operation timed out after {int(QUEUE_OPERATION_TIMEOUT_SECONDS)}s.")
    except Exception as exc:
        error_info = classify_telegram_error(exc)
        wait = _auto_wait_seconds(error_info, resume_cap)
        if wait is None:
            if error_info.category.startswith("flood_wait"):
                raise _FloodStop(error_info) from exc
            return _fail_payload(operation, error_info.user_message)

        long_flood = error_info.category.startswith("flood_wait") and wait > 60
        if long_flood:
            # Surface a live countdown target so the UI can show "auto-resuming in…".
            run["status"] = "flood_waiting"
            run["resume_at"] = _iso_in(wait)
            run["error"] = f"Flood wait {int(wait)}s — auto-resuming when it clears."
            run["updated_at"] = now_iso()
            save_action_runs(queue_runs)
        else:
            logger.info("Queue %s: retrying %s after %ss", run["id"], operation["action_type"], int(wait))

        if not await _cancellable_sleep(wait, run):
            raise _QueueAborted from exc

        if long_flood:
            run["status"] = "running"
            run["resume_at"] = None
            run["error"] = None
            run["updated_at"] = now_iso()
        try:
            return await _run_action_once(manager, action)
        except TimeoutError:
            return _fail_payload(operation, f"Operation timed out after {int(QUEUE_OPERATION_TIMEOUT_SECONDS)}s.")
        except Exception as retry_exc:
            info = classify_telegram_error(retry_exc)
            return _fail_payload(operation, f"{info.user_message} (retry failed)")


def handle_queue_flood_wait(run: dict, operation: dict, remaining: list[dict], error_info: Any) -> None:
    """Handle long flood waits that stop the queue."""
    seconds = error_info.retry_after_seconds or 0
    timestamp = now_iso()
    operation["status"] = "failed"
    operation["completed_at"] = timestamp
    operation["result"] = {
        "account_id": operation["account_id"],
        "label": operation.get("account_label") or operation["account_id"],
        "ok": False,
        "action_type": operation["action_type"],
        "detail": error_info.user_message,
        "target": operation["target"],
        "step_index": operation["step_index"],
    }
    run["results"].append(operation["result"])
    _update_run_counts(run)
    mark_remaining_operations(remaining[1:])
    run["status"] = "flood_wait"
    run["error"] = f"Rate limited by Telegram. Wait {seconds}s ({seconds // 60}m) before retrying."


def _update_run_counts(run: dict) -> None:
    """Recompute completed/ok/failed/skipped from results. A skipped op (a condition
    not met) is its own bucket — neither ok nor failed — so the run summary never
    reads a deliberate skip as a success or a failure."""
    results = run["results"]
    run["completed_count"] = len(results)
    run["skipped_count"] = sum(1 for item in results if item.get("skipped"))
    run["ok_count"] = sum(1 for item in results if item.get("ok") and not item.get("skipped"))
    run["failed_count"] = sum(1 for item in results if not item.get("ok"))



def _audit_queue_request(request: ActionQueueRequest) -> dict[str, Any]:
    """Queue request snapshot for the audit trail — message bodies omitted.

    Run history still keeps full step messages for the operator UI; the always-on
    activity JSONL only needs high-level shape (who/what/targets), not outbound text.
    """
    payload = request.model_dump()
    for step in payload.get("steps") or []:
        original = step.pop("message", None)
        step["has_message"] = bool((original or "").strip())
    return payload


def mark_remaining_operations(operations: list[dict]) -> None:
    timestamp = now_iso()
    for operation in operations:
        if operation.get("status") == "pending":
            operation["status"] = "skipped_canceled"
            operation["completed_at"] = timestamp


def retry_request_from_failed_operations(run: dict) -> ActionQueueRequest:
    failed_operations = [
        operation
        for operation in run.get("operations", [])
        if operation.get("status") == "failed" or operation.get("result", {}).get("ok") is False
    ]
    if not failed_operations:
        raise ValueError("This queue run has no failed operations to retry.")
    steps = [
        ActionQueueStep(
            action_type=operation["action_type"],
            account_ids=[operation["account_id"]],
            targets=[operation["target"]],
            message=operation.get("message"),
            # Carry the guard forward so a retried step is re-checked, not blindly
            # re-run against a target that has since drifted out of the condition.
            condition=operation.get("condition"),
        )
        for operation in failed_operations
    ]
    # Leave the delays unset so the request validator fills them from the operator's
    # current safety settings, rather than pinning stale hardcoded 4s/8s values.
    return ActionQueueRequest(
        steps=steps,
        confirm=True,
        max_operations=min(max(len(steps), 1), 250),
    )


def expand_action_queue(manager: AccountManager, request: ActionQueueRequest) -> list[dict]:
    operations = []
    for step_index, step in enumerate(request.steps, start=1):
        accounts = [manager._get_account(account_id) for account_id in step.account_ids]
        for account in accounts:
            for target in step.targets:
                operations.append(
                    {
                        "step_index": step_index,
                        "action_type": step.action_type,
                        "account_id": account.id,
                        "account_label": account.label,
                        "target": target,
                        "message": step.message,
                        "condition": step.condition.model_dump() if step.condition else None,
                        "status": "ready" if account.authorized else "needs_login",
                    }
                )
    return operations


def resolved_queue_delays(request: ActionQueueRequest) -> dict[str, float]:
    """Resolve the four delay knobs for a run, filling any unset from safety defaults.

    Keys: "accounts" (pause when rotating to a different account) and one per risk
    tier — "instant", "standard", "sensitive". `delay_between_actions` maps to the
    standard tier (its historical role).
    """
    defaults = safety_defaults()

    def pick(value: float | None, key: str) -> float:
        return value if value is not None else defaults[key]

    return {
        "accounts": pick(request.delay_between_accounts, "delay_between_accounts"),
        "instant": pick(request.delay_instant, "delay_instant"),
        "standard": pick(request.delay_between_actions, "delay_between_actions"),
        "sensitive": pick(request.delay_sensitive, "delay_sensitive"),
    }


def tier_delay(tier: str, delays: dict[str, float]) -> float:
    """Base delay for a risk tier, adding jitter to the sensitive tier."""
    base = delays.get(tier, delays["standard"])
    if tier == "sensitive":
        base += random.uniform(0.0, SENSITIVE_JITTER_FRACTION * base)
    return base


def inter_operation_delay(prev_account: str, next_account: str, next_action: str, delays: dict[str, float]) -> float:
    """Seconds to wait before the next operation.

    Rotating to a different account pauses for the account delay; same-account ops
    pause for the upcoming action's tier delay. When the accounts differ we still
    honour the larger of the two, so a sensitive send never gets less spacing than
    its tier demands just because the account also changed.
    """
    tier = action_tier(next_action)
    action_delay = tier_delay(tier, delays)
    if prev_account != next_account:
        return max(delays["accounts"], action_delay)
    return action_delay


def actions_meta_payload() -> dict:
    """Per-action metadata + the currently-resolved tier delays, for the frontend.

    The single source the UI reads to show each action's risk tier, timing badge,
    valid targets, and to estimate a run's duration — so it never re-hardcodes any
    of it. Mirrors backend behaviour exactly because it's built from ACTION_META.
    """
    from .telegram_actions import ACTION_META  # local import: avoids a cycle at module load

    settings = safety_defaults()
    return {
        "actions": {
            action: {
                "tier": meta.tier,
                "category": meta.category,
                "valid_targets": sorted(meta.valid_targets),
                "needs_message": meta.needs_message,
                "message_optional": meta.message_optional,
                "destructive": meta.destructive,
                "natively_schedulable": meta.natively_schedulable,
                "creates_content": meta.creates_content,
            }
            for action, meta in ACTION_META.items()
        },
        "tier_delays": {
            "instant": settings["delay_instant"],
            "standard": settings["delay_between_actions"],
            "sensitive": settings["delay_sensitive"],
        },
        "delay_between_accounts": settings["delay_between_accounts"],
        "max_operations": settings["max_operations"],
    }
