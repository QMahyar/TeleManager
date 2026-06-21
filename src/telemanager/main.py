from __future__ import annotations

import json
import logging
import os
import sys
import threading
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from . import __version__
from .accounts import AccountManager
from .action_queue_service import (
    ACTIVE_RUN_STATUSES,
    TERMINAL_RUN_STATUSES,
    ActionQueueRequest,
    SafetySettingsRequest,
    now_iso,
    retry_request_from_failed_operations,
    safety_defaults,
    save_safety_settings,
    start_action_queue,
)
from .action_queue_service import (
    preview_action_queue as build_queue_preview,
)
from .action_runs_service import list_action_runs, load_action_runs, save_action_runs
from .audit_service import export_events_path, list_events, log_event
from .config import CONFIG_FILE, read_json, write_json
from .dialogs_service import fetch_dialogs, fetch_messages, list_cached_dialogs, resolve_target
from .presets_service import delete_action_preset, list_action_presets, save_action_preset
from .schedules_service import (
    ScheduleRequest,
    SchedulerService,
    ScheduleUpdateRequest,
    schedule_preview,
)
from .sessions_service import (
    delete_local_session,
    export_sessions,
    import_session_file,
    import_session_files,
    rename_account,
    rename_session_file,
)


def _default_frontend_dist() -> Path:
    # When frozen, PyInstaller unpacks bundled datas (the built web/ folder) under
    # sys._MEIPASS; the source-tree layout under apps/web/dist only exists in dev.
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass) / "web"
    return FRONTEND_ROOT_DIR / "dist"


FRONTEND_ROOT_DIR = Path(__file__).resolve().parents[2] / "apps" / "web"
FRONTEND_DIST_DIR = Path(os.getenv("TELEMANAGER_FRONTEND_DIST_DIR", _default_frontend_dist()))
FRONTEND_PUBLIC_DIR = Path(os.getenv("TELEMANAGER_FRONTEND_PUBLIC_DIR", FRONTEND_ROOT_DIR / "public"))
FILE_BODY = File(...)
FILES_BODY = File(...)
NO_STORE_HEADERS = {"Cache-Control": "no-store"}
GITHUB_REPO = "QMahyar/TeleManager"
GITHUB_LATEST_RELEASE_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_RELEASES_URL = f"https://github.com/{GITHUB_REPO}/releases"
manager = AccountManager()
queue_runs: dict[str, dict] = load_action_runs()
scheduler = SchedulerService(manager, queue_runs)


class AccountUpdateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)


class SessionRenameRequest(BaseModel):
    session_name: str = Field(min_length=3, max_length=64)


class ExportSessionsRequest(BaseModel):
    account_ids: list[str] = Field(min_length=1, max_length=100)
    redact_phone: bool = True


class ActionPresetSaveRequest(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    queue: ActionQueueRequest


class ScheduledClearRequest(BaseModel):
    target: str = Field(min_length=1, max_length=500)
    ids: list[int] | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    await scheduler.start()
    try:
        yield
    finally:
        await scheduler.stop()
        await manager.shutdown()


app = FastAPI(title="TeleManager", lifespan=lifespan)
if (FRONTEND_DIST_DIR / "assets").exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")


@app.get("/")
def index() -> Response:
    dist_index = FRONTEND_DIST_DIR / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index, headers=NO_STORE_HEADERS)
    return Response(
        content="Build the React frontend with `npm run build` before serving the UI.",
        media_type="text/plain",
        status_code=503,
        headers=NO_STORE_HEADERS,
    )


@app.get("/favicon.ico")
def favicon_ico() -> FileResponse:
    return FileResponse(first_existing(FRONTEND_DIST_DIR / "favicon.ico", FRONTEND_PUBLIC_DIR / "favicon.ico"))


@app.get("/favicon.svg")
def favicon_svg() -> FileResponse:
    return FileResponse(first_existing(FRONTEND_DIST_DIR / "favicon.svg", FRONTEND_PUBLIC_DIR / "favicon.svg"))


def first_existing(*paths: Path) -> Path:
    for path in paths:
        if path.exists():
            return path
    raise HTTPException(status_code=404, detail="File was not found.")


@app.get("/api/config")
def get_config() -> dict:
    config = read_json(CONFIG_FILE, {})
    return {"api_id": config.get("api_id"), "api_hash_configured": bool(config.get("api_hash"))}


@app.post("/api/config")
async def set_config(request: Request) -> dict:
    payload = await config_payload(request)
    existing = read_json(CONFIG_FILE, {})
    api_id = parse_api_id(payload.get("api_id", existing.get("api_id")))
    api_hash = str(payload.get("api_hash") or "").strip() or existing.get("api_hash")
    if not api_hash:
        raise HTTPException(status_code=400, detail="Telegram API hash is required.")
    write_json(CONFIG_FILE, {"api_id": api_id, "api_hash": str(api_hash).strip()})
    return {"ok": True, "api_id": api_id, "api_hash_configured": True}


async def config_payload(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
        return payload if isinstance(payload, dict) else {}
    form = await request.form()
    return dict(form)


def parse_api_id(value: object) -> int:
    try:
        api_id = int(str(value or "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Telegram API ID must be a positive number.") from exc
    if api_id < 1:
        raise HTTPException(status_code=400, detail="Telegram API ID must be a positive number.")
    return api_id


@app.get("/api/settings/safety")
def get_safety_settings() -> dict:
    return {"settings": safety_defaults()}


@app.post("/api/settings/safety")
def set_safety_settings(request: SafetySettingsRequest) -> dict:
    return {"settings": save_safety_settings(request)}


@app.get("/api/accounts")
def list_accounts() -> dict:
    return {"accounts": manager.list_accounts()}


@app.post("/api/accounts/login")
async def login_account(phone: str = Form(...), label: str = Form(default="")) -> dict:
    try:
        account = await manager.start_login(phone=phone, label=label or None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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


@app.post("/api/sessions/import-file")
async def import_session(label: str = Form(...), file: UploadFile = FILE_BODY) -> dict:
    try:
        account = await import_session_file(manager, file, label)
        log_event("session_imported", "Session imported", account.label, {"account_id": account.id})
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/sessions/import-files")
async def import_sessions_batch(files: list[UploadFile] = FILES_BODY) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one .session file to import.")
    result = await import_session_files(manager, files)
    imported = result["imported"]
    log_event(
        "sessions_imported",
        "Sessions imported",
        f"{len(imported)} session(s)",
        {"imported": len(imported), "failed": len(result["failed"])},
    )
    return {
        "imported": [account.__dict__ for account in imported],
        "failed": result["failed"],
    }


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


@app.get("/api/accounts/{account_id}/messages")
async def get_account_messages(account_id: str, target: str, limit: int = 50) -> dict:
    try:
        return await fetch_messages(manager, account_id, target, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/accounts/{account_id}/resolve-target")
async def resolve_account_target(account_id: str, target: str) -> dict:
    try:
        return await resolve_target(manager, account_id, target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
        return build_queue_preview(manager, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/actions/queue/run")
async def run_action_queue(request: ActionQueueRequest) -> dict:
    try:
        return start_action_queue(manager, queue_runs, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    active = [run for run in queue_runs.values() if run.get("status") in ACTIVE_RUN_STATUSES]
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
    if run.get("status") in ACTIVE_RUN_STATUSES:
        raise HTTPException(status_code=400, detail="Active queue runs cannot be deleted.")
    queue_runs.pop(run_id, None)
    save_action_runs(queue_runs)
    return {"ok": True}


@app.get("/api/actions/queue/runs/{run_id}/export")
def export_action_queue_run(run_id: str) -> Response:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    content = json.dumps(run, indent=2, sort_keys=True)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="telemanager-queue-run-{run_id}.json"'},
    )


@app.post("/api/actions/queue/runs/{run_id}/retry-failed")
async def retry_failed_action_queue_run(run_id: str) -> dict:
    if any(run.get("status") in ACTIVE_RUN_STATUSES for run in queue_runs.values()):
        raise HTTPException(status_code=400, detail="Wait for the active queue to finish before retrying failures.")
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    try:
        retry_request = retry_request_from_failed_operations(run)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_action_queue(retry_request)


@app.post("/api/actions/queue/runs/{run_id}/cancel")
def cancel_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in TERMINAL_RUN_STATUSES:
        return {"run": run}
    run["cancel_requested"] = True
    run["status"] = "canceling"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    return {"run": run}


@app.get("/api/schedules")
def get_schedules() -> dict:
    return {"schedules": scheduler.list_all()}


@app.post("/api/schedules/preview")
def preview_schedule(request: ScheduleRequest) -> dict:
    return schedule_preview(request)


@app.post("/api/schedules")
async def create_schedule(request: ScheduleRequest) -> dict:
    schedule = await scheduler.create(request)
    return {"schedule": schedule}


@app.get("/api/schedules/{schedule_id}")
def get_schedule(schedule_id: str) -> dict:
    schedule = scheduler.get(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule was not found.")
    return {"schedule": schedule}


@app.patch("/api/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, request: ScheduleUpdateRequest) -> dict:
    try:
        schedule = await scheduler.update(schedule_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Schedule was not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"schedule": schedule}


@app.delete("/api/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str) -> dict:
    try:
        await scheduler.delete(schedule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Schedule was not found.") from exc
    return {"ok": True}


@app.post("/api/schedules/{schedule_id}/run-now")
async def run_schedule_now(schedule_id: str) -> dict:
    try:
        schedule = await scheduler.run_now(schedule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Schedule was not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"schedule": schedule}


@app.get("/api/accounts/{account_id}/scheduled")
async def list_account_scheduled(account_id: str, target: str) -> dict:
    try:
        return await scheduler.inspect_scheduled(account_id, target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/{account_id}/scheduled/clear")
async def clear_account_scheduled(account_id: str, request: ScheduledClearRequest) -> dict:
    try:
        result = await scheduler.clear_scheduled(account_id, request.target, request.ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_event(
        "scheduled_cleared",
        "Scheduled messages cleared",
        request.target,
        {"account_id": account_id, "cleared": result["cleared"]},
    )
    return result


@app.get("/api/version")
def get_version() -> dict:
    return {"version": __version__, "repo": GITHUB_REPO, "releases_url": GITHUB_RELEASES_URL}


def _parse_semver(value: str) -> tuple[int, ...]:
    cleaned = value.strip().lstrip("vV").split("+", 1)[0].split("-", 1)[0]
    parts: list[int] = []
    for chunk in cleaned.split("."):
        try:
            parts.append(int(chunk))
        except ValueError:
            break
    return tuple(parts) or (0,)


@app.get("/api/updates/check")
def check_for_updates() -> dict:
    request = urllib.request.Request(
        GITHUB_LATEST_RELEASE_API,
        headers={"Accept": "application/vnd.github+json", "User-Agent": f"TeleManager/{__version__}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 (fixed https URL)
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(status_code=404, detail="No published releases found yet.") from exc
        raise HTTPException(status_code=502, detail="Could not reach GitHub to check for updates.") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach GitHub to check for updates.") from exc

    latest_tag = str(payload.get("tag_name") or "").strip()
    latest_version = latest_tag.lstrip("vV")
    update_available = bool(latest_version) and _parse_semver(latest_version) > _parse_semver(__version__)
    return {
        "current": __version__,
        "latest": latest_version or None,
        "update_available": update_available,
        "html_url": payload.get("html_url") or GITHUB_RELEASES_URL,
        "published_at": payload.get("published_at"),
        "releases_url": GITHUB_RELEASES_URL,
    }


@app.post("/api/app/shutdown")
def shutdown_app() -> dict:
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return {"ok": True}


@app.get("/api/activity")
def get_activity(limit: int = 200) -> dict:
    return {"events": list_events(limit)}


@app.get("/api/activity/export")
def export_activity() -> FileResponse:
    path = export_events_path()
    return FileResponse(path, filename="telemanager-activity.jsonl", media_type="application/jsonl")


@app.exception_handler(Exception)
async def general_exception_handler(_: object, exc: Exception) -> JSONResponse:
    logging.getLogger("telemanager").exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Check server logs for details."},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("telemanager.main:app", host="127.0.0.1", port=8000, reload=True)
