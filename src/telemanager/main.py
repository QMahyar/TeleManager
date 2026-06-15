from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from .accounts import AccountManager
from .action_runs_service import list_action_runs, load_action_runs, save_action_runs
from .audit_service import export_events_path, get_event, list_events, log_event
from .config import CONFIG_FILE, SAFETY_SETTINGS_FILE, read_json, write_json
from .dialogs_service import fetch_dialogs, list_cached_dialogs
from .presets_service import delete_action_preset, list_action_presets, save_action_preset
from .sessions_service import (
    delete_local_session,
    export_sessions,
    import_session_file,
    rename_account,
    rename_session_file,
)
from .telegram_actions import TelegramAction, TelegramActionType

STATIC_DIR = Path(__file__).resolve().parent / "static"
ACCOUNT_IDS_BODY = Body(...)
FILE_BODY = File(...)
manager = AccountManager()
queue_runs: dict[str, dict] = load_action_runs()


class ActionRunRequest(BaseModel):
    action_type: TelegramActionType
    target: str = Field(min_length=1, max_length=500)
    account_ids: list[str] = Field(min_length=1, max_length=100)
    message: str | None = Field(default=None, max_length=4096)
    confirm: bool = False
    delay_seconds: float = Field(default=2.5, ge=0.0, le=30.0)


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
        if self.action_type == "send_message" and not (self.message or "").strip():
            raise ValueError("Message text is required for messaging actions.")
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


class AccountUpdateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)


class SessionRenameRequest(BaseModel):
    session_name: str = Field(min_length=3, max_length=64)


class ExportSessionsRequest(BaseModel):
    account_ids: list[str] = Field(min_length=1, max_length=100)
    redact_phone: bool = True


class SafetySettingsRequest(BaseModel):
    delay_between_accounts: float = Field(default=4.0, ge=1.0, le=60.0)
    delay_between_actions: float = Field(default=8.0, ge=1.0, le=120.0)
    max_operations: int = Field(default=100, ge=1, le=250)


class ActionPresetSaveRequest(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    queue: ActionQueueRequest


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await manager.shutdown()


app = FastAPI(title="TeleManager", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


@app.get("/api/config")
def get_config() -> dict:
    config = read_json(CONFIG_FILE, {})
    return {"api_id": config.get("api_id"), "api_hash_configured": bool(config.get("api_hash"))}


@app.post("/api/config")
def set_config(api_id: int = Form(...), api_hash: str = Form(...)) -> dict:
    write_json(CONFIG_FILE, {"api_id": api_id, "api_hash": api_hash.strip()})
    return {"ok": True}


@app.get("/api/settings/safety")
def get_safety_settings() -> dict:
    return {"settings": safety_defaults()}


@app.post("/api/settings/safety")
def set_safety_settings(request: SafetySettingsRequest) -> dict:
    settings = request.model_dump()
    write_json(SAFETY_SETTINGS_FILE, settings)
    return {"settings": settings}


@app.get("/api/accounts")
def list_accounts() -> dict:
    return {"accounts": manager.list_accounts()}


@app.post("/api/accounts/login")
async def login_account(phone: str = Form(...), label: str = Form(default="")) -> dict:
    account = await manager.start_login(phone=phone, label=label or None)
    log_event("login_started", "Login code requested", account.label, {"account_id": account.id})
    return {"account": account.__dict__}


@app.post("/api/accounts/confirm-code")
async def confirm_code(account_id: str = Form(...), code: str = Form(...)) -> dict:
    try:
        account = await manager.confirm_code(account_id, code)
        log_event("login_completed", "Account login completed", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/confirm-password")
async def confirm_password(account_id: str = Form(...), password: str = Form(...)) -> dict:
    try:
        account = await manager.confirm_password(account_id, password)
        log_event("login_completed", "Account login completed", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/start")
async def start_account(account_id: str = Form(...)) -> dict:
    raise HTTPException(
        status_code=410,
        detail="Manual start/stop is deprecated. Use validate, dialog fetch, or action queue workflows instead.",
    )


@app.post("/api/accounts/stop")
async def stop_account(account_id: str = Form(...)) -> dict:
    raise HTTPException(
        status_code=410,
        detail="Manual start/stop is deprecated. Use validate, dialog fetch, or action queue workflows instead.",
    )


@app.post("/api/accounts/logout")
async def logout_account(account_id: str = Form(...)) -> dict:
    try:
        account = await manager.logout_account(account_id)
        log_event("account_logout", "Account logged out", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/accounts/{account_id}")
def update_account(account_id: str, request: AccountUpdateRequest) -> dict:
    try:
        account = rename_account(manager, account_id, request.label)
        log_event("account_renamed", "Account renamed", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/{account_id}/validate")
async def validate_account(account_id: str) -> dict:
    try:
        account = await manager.validate_account(account_id)
        log_event("session_validated", "Session validated", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: str) -> dict:
    try:
        delete_local_session(manager, account_id)
        log_event("session_deleted", "Local session deleted", account_id, {"account_id": account_id})
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/start-selected")
async def start_selected(account_ids: list[str] = ACCOUNT_IDS_BODY) -> dict:
    raise HTTPException(
        status_code=410,
        detail="Manual start/stop is deprecated. Use validate, dialog fetch, or action queue workflows instead.",
    )


@app.post("/api/accounts/stop-selected")
async def stop_selected(account_ids: list[str] = ACCOUNT_IDS_BODY) -> dict:
    raise HTTPException(
        status_code=410,
        detail="Manual start/stop is deprecated. Use validate, dialog fetch, or action queue workflows instead.",
    )


@app.post("/api/accounts/start-all")
async def start_all() -> dict:
    raise HTTPException(
        status_code=410,
        detail="Manual start/stop is deprecated. Use validate, dialog fetch, or action queue workflows instead.",
    )


@app.post("/api/accounts/stop-all")
async def stop_all() -> dict:
    raise HTTPException(
        status_code=410,
        detail="Manual start/stop is deprecated. Use validate, dialog fetch, or action queue workflows instead.",
    )


@app.post("/api/sessions/import-file")
async def import_session(label: str = Form(...), file: UploadFile = FILE_BODY) -> dict:
    try:
        account = await import_session_file(manager, file, label)
        log_event("session_imported", "Session imported", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/sessions/export")
def export_selected_sessions(request: ExportSessionsRequest) -> FileResponse:
    try:
        export_path = export_sessions(manager, request.account_ids, request.redact_phone)
        log_event(
            "sessions_exported",
            "Sessions exported",
            f"{len(request.account_ids)} session(s)",
            {"account_ids": request.account_ids, "filename": export_path.name},
        )
        return FileResponse(export_path, filename=export_path.name, media_type="application/zip")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/sessions/{account_id}/rename-file")
def rename_session(account_id: str, request: SessionRenameRequest) -> dict:
    try:
        account = rename_session_file(manager, account_id, request.session_name)
        log_event("session_file_renamed", "Session file renamed", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/{account_id}/dialogs/fetch")
async def fetch_account_dialogs(account_id: str, limit: int = 500) -> dict:
    try:
        payload = await fetch_dialogs(manager, account_id, limit)
        log_event(
            "dialogs_fetched",
            "Dialogs fetched",
            payload.get("account_label", account_id),
            {"account_id": account_id, "dialog_count": len(payload.get("dialogs", []))},
        )
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/accounts/{account_id}/dialogs")
def get_account_dialogs(account_id: str) -> dict:
    try:
        return list_cached_dialogs(manager, account_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/actions/preview")
def preview_action(request: ActionRunRequest) -> dict:
    accounts = [manager._get_account(account_id) for account_id in request.account_ids]
    warnings = []
    if request.action_type == "send_message":
        warnings.append("Messaging actions should only be sent to expected recipients and require confirmation.")
    if len(accounts) > 10:
        warnings.append("Large batches may trigger Telegram limits. Consider increasing delay or reducing selection.")
    return {
        "action_type": request.action_type,
        "target": request.target,
        "account_count": len(accounts),
        "accounts": [
            {
                "id": account.id,
                "label": account.label,
                "status": "ready" if account.authorized else "needs_login",
            }
            for account in accounts
        ],
        "delay_seconds": request.delay_seconds,
        "estimated_seconds": max(0, len(accounts) - 1) * request.delay_seconds,
        "requires_message": request.action_type == "send_message",
        "warnings": warnings,
    }


@app.get("/api/actions/presets")
def get_action_presets() -> dict:
    return {"presets": list_action_presets()}


@app.post("/api/actions/presets")
def save_queue_preset(request: ActionPresetSaveRequest) -> dict:
    try:
        preset = save_action_preset(request.name, request.queue.model_dump())
        log_event(
            "action_preset_saved",
            "Action preset saved",
            request.name,
            {"preset_id": preset["id"], "step_count": len(request.queue.steps)},
        )
        return {"preset": preset}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/actions/presets/{preset_id}")
def delete_queue_preset(preset_id: str) -> dict:
    try:
        delete_action_preset(preset_id)
        log_event("action_preset_deleted", "Action preset deleted", preset_id, {"preset_id": preset_id})
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/actions/queue/preview")
def preview_action_queue(request: ActionQueueRequest) -> dict:
    try:
        expanded = expand_action_queue(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    warnings = queue_warnings(request, len(expanded))
    return {
        "step_count": len(request.steps),
        "operation_count": len(expanded),
        "estimated_seconds": estimate_queue_seconds(request, len(expanded)),
        "delay_between_accounts": request.delay_between_accounts,
        "delay_between_actions": request.delay_between_actions,
        "max_operations": request.max_operations,
        "operations": expanded[:100],
        "warnings": warnings,
    }


@app.post("/api/actions/queue/run")
async def run_action_queue(request: ActionQueueRequest) -> dict:
    if not request.confirm:
        raise HTTPException(status_code=400, detail="Queue confirmation is required.")
    try:
        expanded = expand_action_queue(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
    asyncio.create_task(process_action_queue(run_id, request, expanded))
    return {"run_id": run_id, "status": "queued", "operation_count": len(expanded)}


@app.get("/api/actions/queue/runs")
def get_action_queue_runs(limit: int = 25) -> dict:
    return {"runs": list_action_runs(queue_runs, limit)}


@app.get("/api/actions/queue/runs/{run_id}")
def get_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    return {"run": run}


@app.delete("/api/actions/queue/runs")
def clear_action_queue_runs() -> dict:
    active = [run for run in queue_runs.values() if run.get("status") in {"queued", "running", "canceling"}]
    if active:
        raise HTTPException(status_code=400, detail="Stop active queue runs before clearing history.")
    removed = len(queue_runs)
    queue_runs.clear()
    save_action_runs(queue_runs)
    return {"ok": True, "removed": removed}


@app.delete("/api/actions/queue/runs/{run_id}")
def delete_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in {"queued", "running", "canceling"}:
        raise HTTPException(status_code=400, detail="Active queue runs cannot be deleted.")
    queue_runs.pop(run_id, None)
    save_action_runs(queue_runs)
    return {"ok": True}


@app.get("/api/actions/queue/runs/{run_id}/export")
def export_action_queue_run(run_id: str) -> Response:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    content = __import__("json").dumps(run, indent=2, sort_keys=True)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="telemanager-queue-run-{run_id}.json"'},
    )


@app.post("/api/actions/queue/runs/{run_id}/retry-failed")
async def retry_failed_action_queue_run(run_id: str) -> dict:
    if any(run.get("status") in {"queued", "running", "canceling"} for run in queue_runs.values()):
        raise HTTPException(status_code=400, detail="Wait for the active queue to finish before retrying failures.")
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    retry_request = retry_request_from_failed_operations(run)
    return await run_action_queue(retry_request)


@app.post("/api/actions/queue/runs/{run_id}/cancel")
def cancel_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in {"completed", "failed", "interrupted", "canceled"}:
        return {"run": run}
    run["cancel_requested"] = True
    run["status"] = "canceling"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    return {"run": run}


@app.post("/api/actions/run")
async def run_action(request: ActionRunRequest) -> dict:
    try:
        action = TelegramAction(
            action_type=request.action_type,
            target=request.target,
            account_ids=request.account_ids,
            message=request.message,
            confirm=request.confirm,
            delay_seconds=request.delay_seconds,
        )
        results = await manager.run_action(action)
        result_payload = [result.to_dict() for result in results]
        ok_count = sum(1 for result in results if result.ok)
        event = log_event(
            "telegram_action",
            "Telegram action completed",
            f"{request.action_type}: {ok_count}/{len(results)} succeeded",
            {"request": request.model_dump(), "results": result_payload},
        )
        return {"run_id": event["id"], "results": result_payload}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/actions/results/{run_id}")
def get_action_result(run_id: str) -> dict:
    event = get_event(run_id)
    if not event or event.get("event_type") not in {"telegram_action", "telegram_action_queue"}:
        raise HTTPException(status_code=404, detail="Action run was not found.")
    return {"event": event}


async def process_action_queue(run_id: str, request: ActionQueueRequest, expanded: list[dict]) -> None:
    run = queue_runs[run_id]
    run["status"] = "running"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    delay_between_accounts = float(request.delay_between_accounts or safety_defaults()["delay_between_accounts"])
    delay_between_actions = float(request.delay_between_actions or safety_defaults()["delay_between_actions"])
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
            save_action_runs(queue_runs)
            if index > 0:
                previous = expanded[index - 1]
                delay = (
                    delay_between_accounts
                    if previous["account_id"] != operation["account_id"]
                    else delay_between_actions
                )
                from .telegram_actions import safe_delay

                await safe_delay(delay)
            action = TelegramAction(
                action_type=operation["action_type"],
                target=operation["target"],
                account_ids=[operation["account_id"]],
                message=operation.get("message"),
                confirm=True,
                delay_seconds=delay_between_accounts,
            )
            result = (await manager.run_action(action))[0]
            result_payload = result.to_dict()
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
            save_action_runs(queue_runs)
        if run.get("status") != "canceled":
            run["status"] = "completed"
        save_action_runs(queue_runs)
    except Exception as exc:
        run["status"] = "failed"
        run["error"] = str(exc)
    finally:
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


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def safety_defaults() -> dict:
    settings = read_json(SAFETY_SETTINGS_FILE, {})
    return SafetySettingsRequest(**settings).model_dump()


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
        raise HTTPException(status_code=400, detail="This queue run has no failed operations to retry.")
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


def expand_action_queue(request: ActionQueueRequest) -> list[dict]:
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


def estimate_queue_seconds(request: ActionQueueRequest, operation_count: int) -> float:
    if operation_count <= 1:
        return 0.0
    delay_between_accounts = float(request.delay_between_accounts or safety_defaults()["delay_between_accounts"])
    delay_between_actions = float(request.delay_between_actions or safety_defaults()["delay_between_actions"])
    return round(
        max(0, operation_count - 1) * max(delay_between_accounts, delay_between_actions),
        1,
    )


def queue_warnings(request: ActionQueueRequest, operation_count: int) -> list[str]:
    warnings = [
        "Default delays are intentionally conservative. Increase them for older or high-risk sessions.",
    ]
    if operation_count > 30:
        warnings.append("This is a large queue. Consider splitting it into smaller runs.")
    if any(step.action_type == "send_message" for step in request.steps):
        warnings.append("Only message people or chats where you have clear permission or expectation.")
    if any(len(step.targets) > 5 for step in request.steps):
        warnings.append("Many targets in one step can trigger Telegram flood controls. Review carefully.")
    return warnings


@app.get("/api/activity")
def get_activity(limit: int = 200) -> dict:
    return {"events": list_events(limit)}


@app.get("/api/activity/export")
def export_activity() -> FileResponse:
    path = export_events_path()
    return FileResponse(path, filename="telemanager-activity.jsonl", media_type="application/jsonl")


@app.exception_handler(Exception)
async def general_exception_handler(_: object, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("telemanager.main:app", host="127.0.0.1", port=8000, reload=True)
