"""Account-scoped settings (/api/accounts/{id}/profile, /username, /sessions, ...).

Direct per-account operations on the account itself — see ROADMAP.md. Every
handler delegates to account_settings_service and maps ValueError → HTTP 400.
"""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .. import account_settings_service as svc
from ..runtime import manager

router = APIRouter()

PHOTO_FILE = File(...)


class ProfileUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    about: str | None = None


class UsernameRequest(BaseModel):
    # max_length here is only a cheap oversized-payload guard; the real rule
    # (5–32 chars, letter-first) lives in validate_username in the service.
    username: str = Field(default="", max_length=64)


class TerminateSessionRequest(BaseModel):
    hash: str = Field(min_length=1, max_length=32)


class AddContactRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=128)
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(default="", max_length=64)
    phone: str = Field(default="", max_length=32)


class UnblockUserRequest(BaseModel):
    user_id: int = Field(gt=0)


class AccountTtlRequest(BaseModel):
    days: int = Field(ge=1, le=730)


def _bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/api/accounts/{account_id}/profile")
async def get_profile(account_id: str) -> dict:
    try:
        return await svc.get_profile(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/profile")
async def update_profile(account_id: str, body: ProfileUpdateRequest) -> dict:
    try:
        account = await svc.update_profile(
            manager,
            account_id,
            first_name=body.first_name,
            last_name=body.last_name,
            about=body.about,
        )
        return {"account": account}
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/username")
async def update_username(account_id: str, body: UsernameRequest) -> dict:
    try:
        account = await svc.update_username(manager, account_id, body.username)
        return {"account": account}
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.get("/api/accounts/{account_id}/sessions")
async def list_sessions(account_id: str) -> dict:
    try:
        return await svc.list_sessions(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/sessions/terminate")
async def terminate_session(account_id: str, body: TerminateSessionRequest) -> dict:
    try:
        return await svc.terminate_session(manager, account_id, body.hash)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/sessions/terminate-others")
async def terminate_other_sessions(account_id: str) -> dict:
    try:
        return await svc.terminate_other_sessions(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.get("/api/accounts/{account_id}/contacts")
async def list_contacts(account_id: str) -> dict:
    try:
        return await svc.list_contacts(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/contacts")
async def add_contact(account_id: str, body: AddContactRequest) -> dict:
    try:
        return await svc.add_contact(
            manager,
            account_id,
            identifier=body.identifier,
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone,
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.delete("/api/accounts/{account_id}/contacts")
async def delete_contact(account_id: str, identifier: str) -> dict:
    try:
        return await svc.delete_contact(manager, account_id, identifier)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.get("/api/accounts/{account_id}/blocked")
async def list_blocked(account_id: str) -> dict:
    try:
        return await svc.list_blocked(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/blocked/unblock")
async def unblock_user(account_id: str, body: UnblockUserRequest) -> dict:
    try:
        return await svc.unblock_user(manager, account_id, body.user_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.get("/api/accounts/{account_id}/ttl")
async def get_ttl(account_id: str) -> dict:
    try:
        return await svc.get_account_ttl(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/ttl")
async def set_ttl(account_id: str, body: AccountTtlRequest) -> dict:
    try:
        return await svc.set_account_ttl(manager, account_id, body.days)
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/api/accounts/{account_id}/photo")
async def set_photo(account_id: str, file: UploadFile = PHOTO_FILE) -> dict:
    data = await file.read()
    try:
        return await svc.set_profile_photo(manager, account_id, data, file.filename or "photo.jpg")
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.delete("/api/accounts/{account_id}/photo")
async def delete_photo(account_id: str) -> dict:
    try:
        return await svc.delete_profile_photo(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc
