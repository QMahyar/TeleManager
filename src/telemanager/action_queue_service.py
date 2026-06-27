from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid

from pydantic import BaseModel, Field, model_validator
from telethon.errors import FloodWaitError

from .accounts import AccountManager
from .action_runs_service import save_action_runs
from .audit_service import log_event
from .config import SAFETY_SETTINGS_FILE, now_iso, read_json, write_json
from .telegram_actions import (
    MESSAGE_REQUIRED_ACTIONS,
    TelegramAction,
    TelegramActionResult,
    TelegramActionType,
    action_tier,
    safe_delay,
    validate_target_for_action,
)

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
TERMINAL_RUN_STATUSES = {"completed", "failed", "interrupted", "canceled", "flood_wait"}
ACTIVE_RUN_STATUSES = {"queued", "running", "canceling"}

# The event loop only holds a weak reference to bare tasks, so a running queue can be
# garbage-collected mid-run. Keep a strong reference until the task finishes.
_background_tasks: set[asyncio.Task] = set()


class ActionQueueStep(BaseModel):
    action_type: TelegramActionType
    targets: list[str] = Field(min_length=1, max_length=25)
    account_ids: list[str] = Field(min_length=1, max_length=25)
    message: str | None = Field(default=None, max_length=4096)

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


def safety_defaults() -> dict:
    settings = read_json(SAFETY_SETTINGS_FILE, {})
    return SafetySettingsRequest(**settings).model_dump()


def save_safety_settings(request: SafetySettingsRequest) -> dict:
    settings = request.model_dump()
    write_json(SAFETY_SETTINGS_FILE, settings)
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
        "current": None,
        "operations": expanded,
        "results": [],
        "error": None,
        "audit_event_id": None,
        "cancel_requested": False,
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
    run_account_ids = sorted({operation["account_id"] for operation in expanded})
    # Hold the per-account session locks for the whole run so a `.session` file is
    # never opened by two runs at once (manual + scheduled, or two schedules). Runs
    # over disjoint accounts don't contend; same-account runs serialize here.
    async with manager.session_guard(run_account_ids):
        try:
            for index, operation in enumerate(expanded):
                if run.get("cancel_requested"):
                    mark_remaining_operations(expanded[index:])
                    run["status"] = "canceled"
                    run["error"] = "Queue canceled before the next operation started."
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
                        mark_remaining_operations(expanded[index:])
                        run["status"] = "canceled"
                        run["error"] = "Queue canceled before the next operation started."
                        break
                operation["status"] = "running"
                operation["started_at"] = now_iso()
                run["current"] = operation
                run["updated_at"] = now_iso()
                throttled_save()
                action = TelegramAction(
                    action_type=operation["action_type"],
                    target=operation["target"],
                    account_ids=[operation["account_id"]],
                    message=operation.get("message"),
                    confirm=True,
                    delay_seconds=delays["accounts"],
                )
                try:
                    result = await asyncio.wait_for(
                        manager.run_warm_action(action), timeout=QUEUE_OPERATION_TIMEOUT_SECONDS
                    )
                    result_payload = result.to_dict()
                except FloodWaitError as flood:
                    handle_queue_flood_wait(run, operation, expanded[index:], flood)
                    break
                except TimeoutError:
                    # Fail just this operation and continue — a single stuck call must
                    # not take the whole run down. Shape matches TelegramActionResult.
                    logger.warning(
                        "Queue %s: %s on %s timed out after %ss",
                        run_id,
                        operation["action_type"],
                        operation["account_id"],
                        QUEUE_OPERATION_TIMEOUT_SECONDS,
                    )
                    result_payload = TelegramActionResult(
                        operation["account_id"],
                        operation["account_label"],
                        False,
                        operation["action_type"],
                        f"Operation timed out after {int(QUEUE_OPERATION_TIMEOUT_SECONDS)}s.",
                    ).to_dict()
                result_payload["target"] = operation["target"]
                result_payload["step_index"] = operation["step_index"]
                operation["status"] = "ok" if result_payload["ok"] else "failed"
                operation["completed_at"] = now_iso()
                operation["result"] = result_payload
                run["results"].append(result_payload)
                run["completed_count"] = len(run["results"])
                run["ok_count"] = sum(1 for item in run["results"] if item["ok"])
                run["failed_count"] = run["completed_count"] - run["ok_count"]
                run["updated_at"] = now_iso()
                throttled_save()
            if run.get("status") not in {"canceled", "flood_wait"}:
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
                {"request": request.model_dump(), "results": run["results"], "error": run["error"]},
            )
            run["audit_event_id"] = event["id"]
            save_action_runs(queue_runs)


def handle_queue_flood_wait(run: dict, operation: dict, remaining: list[dict], flood: FloodWaitError) -> None:
    seconds = getattr(flood, "seconds", 0) or 0
    timestamp = now_iso()
    operation["status"] = "failed"
    operation["completed_at"] = timestamp
    operation["result"] = {
        "account_id": operation["account_id"],
        "label": operation.get("account_label") or operation["account_id"],
        "ok": False,
        "action_type": operation["action_type"],
        "detail": f"Telegram flood wait: pause {seconds}s before retrying.",
        "target": operation["target"],
        "step_index": operation["step_index"],
    }
    run["results"].append(operation["result"])
    run["completed_count"] = len(run["results"])
    run["ok_count"] = sum(1 for item in run["results"] if item["ok"])
    run["failed_count"] = run["completed_count"] - run["ok_count"]
    mark_remaining_operations(remaining[1:])
    run["status"] = "flood_wait"
    run["error"] = f"Telegram rate-limited this run. Wait {seconds}s before retrying the remaining operations."


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
        )
        for operation in failed_operations
    ]
    return ActionQueueRequest(
        steps=steps,
        confirm=True,
        delay_between_accounts=4.0,
        delay_between_actions=8.0,
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
