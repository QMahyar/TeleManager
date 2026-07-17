"""Account lifecycle + local session files (/api/accounts/*, /api/sessions/*)."""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..audit_service import log_event
from ..runtime import manager
from ..sessions_service import (
    MAX_SESSION_IMPORT_FILES,
    delete_local_session,
    export_sessions,
    import_session_files,
    rename_account,
    rename_session_file,
    set_account_photos_mode,
)

router = APIRouter()

FILES_BODY = File(...)


class AccountUpdateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)


class AccountPhotosModeRequest(BaseModel):
    photos_mode: Literal["default", "on", "off"]


class SessionRenameRequest(BaseModel):
    session_name: str = Field(min_length=3, max_length=64)


class ExportSessionsRequest(BaseModel):
    account_ids: list[str] = Field(min_length=1, max_length=100)
    redact_phone: bool = True


@router.get("/api/accounts")
def list_accounts() -> dict:
    return {"accounts": manager.list_accounts()}


@router.post("/api/accounts/login")
async def login_account(phone: str = Form(...), label: str = Form(default="")) -> dict:
    try:
        account = await manager.start_login(phone=phone, label=label or None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_event("login_started", "Login code requested", account.label, {"account_id": account.id})
    return {"account": account.to_public_dict()}


@router.post("/api/accounts/confirm-code")
async def confirm_code(account_id: str = Form(...), code: str = Form(...)) -> dict:
    try:
        account = await manager.confirm_code(account_id, code)
        log_event("login_completed", "Account login completed", account.label, {"account_id": account.id})
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/accounts/confirm-password")
async def confirm_password(account_id: str = Form(...), password: str = Form(...)) -> dict:
    try:
        account = await manager.confirm_password(account_id, password)
        log_event("login_completed", "Account login completed", account.label, {"account_id": account.id})
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/accounts/logout")
async def logout_account(account_id: str = Form(...)) -> dict:
    try:
        account = await manager.logout_account(account_id)
        log_event("account_logout", "Account logged out", account.label, {"account_id": account.id})
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/api/accounts/{account_id}")
def update_account(account_id: str, request: AccountUpdateRequest) -> dict:
    try:
        account = rename_account(manager, account_id, request.label)
        log_event("account_renamed", "Account renamed", account.label, {"account_id": account.id})
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/accounts/{account_id}/photos-mode")
def set_account_photos(account_id: str, request: AccountPhotosModeRequest) -> dict:
    try:
        account = set_account_photos_mode(manager, account_id, request.photos_mode)
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/accounts/validate-all")
async def validate_all_accounts() -> dict:
    """Validate all authorized accounts in parallel."""
    accounts = [acc for acc in manager.accounts.values() if acc.authorized]
    if not accounts:
        return {"results": [], "ok_count": 0, "failed_count": 0}

    tasks = [manager.validate_account(acc.id) for acc in accounts]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    rows = []
    for account, result in zip(accounts, results, strict=True):
        if isinstance(result, BaseException):
            ok = False
            error = str(result)
        else:
            ok = result.authorized
            error = result.last_error
        rows.append({"account_id": account.id, "label": account.label, "ok": ok, "error": error})
    ok_count = sum(row["ok"] for row in rows)
    return {
        "results": rows,
        "ok_count": ok_count,
        "failed_count": len(accounts) - ok_count,
    }


@router.post("/api/accounts/{account_id}/validate")
async def validate_account(account_id: str) -> dict:
    """Re-check a single account's session against Telegram (used by the per-row
    Validate button). 400s with a readable message on any auth/session failure."""
    try:
        account = await manager.validate_account(account_id)
        log_event("session_validated", "Session validated", account.label, {"account_id": account.id})
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/api/accounts/{account_id}")
def delete_account(account_id: str) -> dict:
    try:
        delete_local_session(manager, account_id)
        log_event("session_deleted", "Local session deleted", account_id, {"account_id": account_id})
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/sessions/import-files")
async def import_sessions_batch(files: list[UploadFile] = FILES_BODY) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one .session file to import.")
    if len(files) > MAX_SESSION_IMPORT_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Select no more than {MAX_SESSION_IMPORT_FILES} session files.",
        )
    result = await import_session_files(manager, files)
    imported = result["imported"]
    log_event(
        "sessions_imported",
        "Sessions imported",
        f"{len(imported)} session(s)",
        {"imported": len(imported), "failed": len(result["failed"])},
    )
    return {
        "imported": [account.to_public_dict() for account in imported],
        "failed": result["failed"],
    }


@router.post("/api/sessions/export")
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


@router.post("/api/sessions/{account_id}/rename-file")
def rename_session(account_id: str, request: SessionRenameRequest) -> dict:
    try:
        account = rename_session_file(manager, account_id, request.session_name)
        log_event("session_file_renamed", "Session file renamed", account.label, {"account_id": account.id})
        return {"account": account.to_public_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
