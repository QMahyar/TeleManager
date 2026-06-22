from __future__ import annotations

import asyncio
import time
import uuid

from pydantic import BaseModel, Field, model_validator
from telethon.errors import FloodWaitError

from .accounts import AccountManager
from .action_runs_service import save_action_runs
from .audit_service import log_event
from .config import SAFETY_SETTINGS_FILE, now_iso, read_json, write_json
from .telegram_actions import TelegramAction, TelegramActionType, safe_delay, validate_target_for_action

QUEUE_SAVE_INTERVAL_SECONDS = 2.0
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
        if (
            self.action_type
            in {
                "send_message",
                "send_media",
                "schedule_message",
                "forward_message",
                "edit_message",
                "delete_messages",
                "pin_message",
                "unpin_message",
                "download_media",
            }
            and not (self.message or "").strip()
        ):
            raise ValueError("Message text is required for this action. Options may be required for advanced actions.")
        for target in self.targets:
            error = validate_target_for_action(self.action_type, target)
            if error:
                raise ValueError(error)
        return self


class ActionQueueRequest(BaseModel):
    steps: list[ActionQueueStep] = Field(min_length=1, max_length=20)
    confirm: bool = False
    delay_between_accounts: float | None = Field(default=None, ge=1.0, le=60.0)
    delay_between_actions: float | None = Field(default=None, ge=1.0, le=120.0)
    max_operations: int | None = Field(default=None, ge=1, le=250)

    @model_validator(mode="after")
    def validate_queue(self) -> ActionQueueRequest:
        defaults = safety_defaults()
        self.delay_between_accounts = self.delay_between_accounts or defaults["delay_between_accounts"]
        self.delay_between_actions = self.delay_between_actions or defaults["delay_between_actions"]
        self.max_operations = self.max_operations or defaults["max_operations"]
        operation_count = sum(len(step.account_ids) * len(step.targets) for step in self.steps)
        if operation_count > self.max_operations:
            raise ValueError(
                f"Queue has {operation_count} operations, above the configured limit of {self.max_operations}."
            )
        return self


class SafetySettingsRequest(BaseModel):
    delay_between_accounts: float = Field(default=4.0, ge=1.0, le=60.0)
    delay_between_actions: float = Field(default=8.0, ge=1.0, le=120.0)
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

    delay_between_accounts, delay_between_actions = resolved_queue_delays(request)
    run_account_ids = [operation["account_id"] for operation in expanded]
    try:
        for index, operation in enumerate(expanded):
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
            if index > 0:
                previous = expanded[index - 1]
                delay = (
                    delay_between_accounts
                    if previous["account_id"] != operation["account_id"]
                    else delay_between_actions
                )
                await safe_delay(delay)
            action = TelegramAction(
                action_type=operation["action_type"],
                target=operation["target"],
                account_ids=[operation["account_id"]],
                message=operation.get("message"),
                confirm=True,
                delay_seconds=delay_between_accounts,
            )
            try:
                result = await manager.run_warm_action(action)
                result_payload = result.to_dict()
            except FloodWaitError as flood:
                handle_queue_flood_wait(run, operation, expanded[index:], flood)
                break
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


def resolved_queue_delays(request: ActionQueueRequest) -> tuple[float, float]:
    if request.delay_between_accounts is None or request.delay_between_actions is None:
        defaults = safety_defaults()
        return defaults["delay_between_accounts"], defaults["delay_between_actions"]
    return request.delay_between_accounts, request.delay_between_actions
