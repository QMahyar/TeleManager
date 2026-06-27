"""Local audit log (/api/activity*)."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..audit_service import export_events_path, list_events

router = APIRouter()


@router.get("/api/activity")
def get_activity(limit: int = 200) -> dict:
    return {"events": list_events(limit)}


@router.get("/api/activity/export")
def export_activity() -> FileResponse:
    path = export_events_path()
    return FileResponse(path, filename="telemanager-activity.jsonl", media_type="application/jsonl")
