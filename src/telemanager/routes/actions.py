"""Action presets + the guarded action queue (/api/actions/*)."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..action_queue_service import (
    ACTIVE_RUN_STATUSES,
    TERMINAL_RUN_STATUSES,
    ActionQueueRequest,
    now_iso,
    retry_request_from_failed_operations,
    start_action_queue,
)
from ..action_runs_service import list_action_runs, save_action_runs
from ..audit_service import log_event
from ..presets_service import delete_action_preset, list_action_presets, save_action_preset
from ..runtime import manager, queue_runs

router = APIRouter()


class ActionPresetSaveRequest(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    queue: ActionQueueRequest


@router.get("/api/actions/presets")
def get_action_presets() -> dict:
    return {"presets": list_action_presets()}


@router.post("/api/actions/presets")
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


@router.delete("/api/actions/presets/{preset_id}")
def delete_queue_preset(preset_id: str) -> dict:
    try:
        delete_action_preset(preset_id)
        log_event("action_preset_deleted", "Action preset deleted", preset_id, {"preset_id": preset_id})
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/actions/queue/run")
async def run_action_queue(request: ActionQueueRequest) -> dict:
    try:
        return start_action_queue(manager, queue_runs, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/actions/queue/runs")
def get_action_queue_runs(limit: int = 25) -> dict:
    return {"runs": list_action_runs(queue_runs, limit)}


@router.get("/api/actions/queue/runs/{run_id}")
def get_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    return {"run": run}


@router.delete("/api/actions/queue/runs")
def clear_action_queue_runs() -> dict:
    active = [run for run in queue_runs.values() if run.get("status") in ACTIVE_RUN_STATUSES]
    if active:
        raise HTTPException(status_code=400, detail="Stop active queue runs before clearing history.")
    removed = len(queue_runs)
    queue_runs.clear()
    save_action_runs(queue_runs)
    return {"ok": True, "removed": removed}


@router.delete("/api/actions/queue/runs/{run_id}")
def delete_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in ACTIVE_RUN_STATUSES:
        raise HTTPException(status_code=400, detail="Active queue runs cannot be deleted.")
    queue_runs.pop(run_id, None)
    save_action_runs(queue_runs)
    return {"ok": True}


@router.get("/api/actions/queue/runs/{run_id}/export")
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


@router.post("/api/actions/queue/runs/{run_id}/retry-failed")
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


@router.post("/api/actions/queue/runs/{run_id}/cancel")
def cancel_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in TERMINAL_RUN_STATUSES:
        return {"run": run}
    run["cancel_requested"] = True
    # A cancel supersedes a pending pause — clear it so the worker doesn't park in the
    # pause gate instead of stopping.
    run["pause_requested"] = False
    run["status"] = "canceling"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    return {"run": run}


@router.post("/api/actions/queue/runs/{run_id}/pause")
def pause_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in TERMINAL_RUN_STATUSES:
        raise HTTPException(status_code=400, detail="This queue run has already finished.")
    run["pause_requested"] = True
    # "pausing" until the worker reaches the gate and parks at "paused"; leave a
    # mid-flight flood_waiting status alone so the countdown keeps rendering.
    if run.get("status") not in {"paused", "flood_waiting"}:
        run["status"] = "pausing"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    return {"run": run}


@router.post("/api/actions/queue/runs/{run_id}/resume")
def resume_action_queue_run(run_id: str) -> dict:
    run = queue_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Queue run was not found.")
    if run.get("status") in TERMINAL_RUN_STATUSES:
        raise HTTPException(status_code=400, detail="This queue run has already finished.")
    run["pause_requested"] = False
    # The worker flips paused → running when it wakes; nudge the status now so the UI
    # reflects intent immediately even before the next poll.
    if run.get("status") in {"pausing", "paused"}:
        run["status"] = "running"
    run["updated_at"] = now_iso()
    save_action_runs(queue_runs)
    return {"run": run}
