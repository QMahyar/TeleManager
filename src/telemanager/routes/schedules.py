"""Recurring schedules + Telegram-native scheduled messages (/api/schedules/*, /api/scheduled/*)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..audit_service import log_event
from ..runtime import scheduler
from ..schedules_service import ScheduleRequest, ScheduleUpdateRequest, schedule_preview

router = APIRouter()


class ScheduledClearRequest(BaseModel):
    target: str = Field(min_length=1, max_length=500)
    ids: list[int] | None = None


@router.get("/api/schedules")
def get_schedules() -> dict:
    return {"schedules": scheduler.list_all()}


@router.post("/api/schedules/preview")
def preview_schedule(request: ScheduleRequest) -> dict:
    return schedule_preview(request)


@router.post("/api/schedules")
async def create_schedule(request: ScheduleRequest) -> dict:
    schedule = await scheduler.create(request)
    return {"schedule": schedule}


@router.get("/api/schedules/{schedule_id}")
def get_schedule(schedule_id: str) -> dict:
    schedule = scheduler.get(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule was not found.")
    return {"schedule": schedule}


@router.patch("/api/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, request: ScheduleUpdateRequest) -> dict:
    try:
        schedule = await scheduler.update(schedule_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Schedule was not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"schedule": schedule}


@router.delete("/api/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str) -> dict:
    try:
        await scheduler.delete(schedule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Schedule was not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True}


@router.post("/api/schedules/{schedule_id}/run-now")
async def run_schedule_now(schedule_id: str) -> dict:
    try:
        schedule = await scheduler.run_now(schedule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Schedule was not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"schedule": schedule}


@router.get("/api/scheduled/overview")
async def scheduled_overview() -> dict:
    return await scheduler.scheduled_overview()


@router.get("/api/accounts/{account_id}/scheduled")
async def list_account_scheduled(account_id: str, target: str) -> dict:
    try:
        return await scheduler.inspect_scheduled(account_id, target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/accounts/{account_id}/scheduled/clear")
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
