"""Dialog discovery, cached avatars, and message previews (/api/accounts/{id}/dialogs*, /messages)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..audit_service import log_event
from ..config import AVATARS_DIR
from ..dialogs_service import (
    avatar_path,
    fetch_dialogs,
    fetch_messages,
    list_cached_dialogs,
    search_messages,
)
from ..runtime import manager

router = APIRouter()


@router.post("/api/accounts/{account_id}/dialogs/fetch")
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


@router.get("/api/accounts/{account_id}/dialogs")
def get_account_dialogs(account_id: str) -> dict:
    try:
        return list_cached_dialogs(manager, account_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/accounts/{account_id}/dialogs/{dialog_id}/photo")
def get_dialog_photo(account_id: str, dialog_id: str) -> FileResponse:
    """Serve a locally-cached dialog avatar thumbnail (downloaded during fetch).

    No Telethon client is opened here, so this never contends for the session lock.
    The dialog id is parsed to an int and the resolved path is asserted to live
    under AVATARS_DIR, so neither path segment can escape the cache directory.
    """
    try:
        manager._get_account(account_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Account was not found.") from exc
    try:
        numeric_id = int(dialog_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Photo was not found.") from exc
    resolved = avatar_path(account_id, numeric_id).resolve()
    if AVATARS_DIR.resolve() not in resolved.parents or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Photo was not found.")
    return FileResponse(resolved, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"})


@router.get("/api/accounts/{account_id}/messages")
async def get_account_messages(account_id: str, target: str, limit: int = 50) -> dict:
    try:
        return await fetch_messages(manager, account_id, target, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/accounts/{account_id}/messages/search")
async def search_account_messages(account_id: str, q: str, limit: int = 50) -> dict:
    """Search this account's message history across every dialog (global search)."""
    try:
        return await search_messages(manager, account_id, q, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
