"""Account-scoped settings operations (profile, username, sessions, contacts).

These act on the account *itself*, not on a dialog, so they run as direct ad-hoc
operations via ``manager.temp_client`` (which holds the account's exclusive
session lock) rather than through the rate-limited dialog action queue. Every
write is audited. See ROADMAP.md ("two operation scopes") for the rationale.
"""
from __future__ import annotations

import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any

from telethon import utils as telethon_utils
from telethon.errors import RPCError
from telethon.tl.functions.account import (
    GetAccountTTLRequest,
    GetAuthorizationsRequest,
    ResetAuthorizationRequest,
    SetAccountTTLRequest,
    UpdateProfileRequest,
    UpdateUsernameRequest,
)
from telethon.tl.functions.auth import ResetAuthorizationsRequest
from telethon.tl.functions.contacts import (
    AddContactRequest,
    DeleteContactsRequest,
    GetBlockedRequest,
    GetContactsRequest,
)
from telethon.tl.functions.photos import (
    DeletePhotosRequest,
    UploadProfilePhotoRequest,
)
from telethon.tl.functions.users import GetFullUserRequest
from telethon.tl.types import AccountDaysTTL

from .accounts import AccountManager
from .audit_service import log_event
from .telegram_errors import classify_telegram_error

# ---------------------------------------------------------------------------
# Pure helpers (no client) — unit-tested in test_account_settings.py
# ---------------------------------------------------------------------------

# Telegram usernames: 5–32 chars, start with a letter, letters/digits/underscore.
_USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{4,31}$")

# Real Telegram limits: names 64, bio 70 (140 for Premium) — cap at the Premium
# max so we never wrongly reject a valid Premium bio; Telegram is the authority.
_PROFILE_LIMITS = {"first_name": 64, "last_name": 64, "about": 140}

# The self-destruct periods Telegram's own clients offer (in days).
_ALLOWED_TTL_DAYS = (30, 90, 180, 365)

# Reject oversized uploads before touching Telegram (Telegram's own cap is ~10 MB).
_MAX_PHOTO_BYTES = 10 * 1024 * 1024


def validate_ttl_days(days: int) -> int:
    if days not in _ALLOWED_TTL_DAYS:
        allowed = ", ".join(str(d) for d in _ALLOWED_TTL_DAYS)
        raise ValueError(f"Self-destruct period must be one of: {allowed} days.")
    return days


def normalize_username(value: str) -> str:
    """Drop a leading @ and surrounding whitespace. '' means 'clear username'."""
    return value.strip().lstrip("@").strip()


def validate_username(value: str) -> str:
    """Return a normalized username, or '' to clear it. Raises on invalid input."""
    username = normalize_username(value)
    if username == "":
        return ""
    if not _USERNAME_RE.match(username):
        raise ValueError(
            "Username must be 5–32 characters, start with a letter, and use only "
            "letters, digits, or underscores."
        )
    return username


def clean_profile_field(name: str, value: str | None) -> str | None:
    """Strip and length-check one profile field. None = leave unchanged."""
    if value is None:
        return None
    cleaned = value.strip()
    limit = _PROFILE_LIMITS[name]
    if len(cleaned) > limit:
        label = name.replace("_", " ")
        raise ValueError(f"{label.capitalize()} must be at most {limit} characters.")
    return cleaned


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _authorization_dict(auth: Any) -> dict[str, Any]:
    # hash is an int64 — return as a string so the browser can't lose precision
    # and hand back a wrong value when terminating the session.
    return {
        "hash": str(getattr(auth, "hash", 0)),
        "current": bool(getattr(auth, "current", False)),
        "device_model": getattr(auth, "device_model", None),
        "platform": getattr(auth, "platform", None),
        "system_version": getattr(auth, "system_version", None),
        "app_name": getattr(auth, "app_name", None),
        "app_version": getattr(auth, "app_version", None),
        "ip": getattr(auth, "ip", None),
        "country": getattr(auth, "country", None),
        "date_active": _iso(getattr(auth, "date_active", None)),
        "date_created": _iso(getattr(auth, "date_created", None)),
    }


def _user_dict(user: Any) -> dict[str, Any]:
    return {
        "id": getattr(user, "id", None),
        "username": getattr(user, "username", None),
        "first_name": getattr(user, "first_name", None),
        "last_name": getattr(user, "last_name", None),
        "phone": getattr(user, "phone", None),
        "bot": bool(getattr(user, "bot", False)),
    }


# ---------------------------------------------------------------------------
# Client ops
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _client_op(manager: AccountManager, account_id: str) -> AsyncIterator[tuple[Any, Any]]:
    """Yield (account, client) under the account's exclusive session lock,
    converting Telegram RPC errors into readable ValueErrors (→ HTTP 400)."""
    account = manager._get_account(account_id)
    try:
        async with manager.temp_client(account.id) as client:
            yield account, client
    except ValueError:
        raise  # AccountBusyError / unauthorized / not-found: already friendly
    except RPCError as exc:
        raise ValueError(classify_telegram_error(exc).user_message) from exc


async def get_profile(manager: AccountManager, account_id: str) -> dict[str, Any]:
    async with _client_op(manager, account_id) as (_account, client):
        me = await client.get_me()
        full = await client(GetFullUserRequest(await client.get_input_entity(me)))
    return {
        "first_name": getattr(me, "first_name", None),
        "last_name": getattr(me, "last_name", None),
        "username": getattr(me, "username", None),
        "phone": getattr(me, "phone", None),
        "about": getattr(full.full_user, "about", None),
    }


async def update_profile(
    manager: AccountManager,
    account_id: str,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    about: str | None = None,
) -> dict[str, Any]:
    first_name = clean_profile_field("first_name", first_name)
    last_name = clean_profile_field("last_name", last_name)
    about = clean_profile_field("about", about)
    if first_name is None and last_name is None and about is None:
        raise ValueError("Nothing to update.")
    async with _client_op(manager, account_id) as (account, client):
        await client(UpdateProfileRequest(first_name=first_name, last_name=last_name, about=about))
        await manager._refresh_account_identity(account, client)
    manager._save_accounts()
    log_event("account_profile_updated", "Profile updated", account.label, {"account_id": account.id})
    return account.to_public_dict()


async def update_username(manager: AccountManager, account_id: str, username: str) -> dict[str, Any]:
    value = validate_username(username)
    async with _client_op(manager, account_id) as (account, client):
        await client(UpdateUsernameRequest(value))
        await manager._refresh_account_identity(account, client)
    manager._save_accounts()
    log_event(
        "account_username_updated",
        "Username updated",
        account.label,
        {"account_id": account.id, "username": value or None},
    )
    return account.to_public_dict()


async def list_sessions(manager: AccountManager, account_id: str) -> dict[str, Any]:
    async with _client_op(manager, account_id) as (_account, client):
        result = await client(GetAuthorizationsRequest())
    return {"sessions": [_authorization_dict(a) for a in result.authorizations]}


async def terminate_session(manager: AccountManager, account_id: str, session_hash: str) -> dict[str, Any]:
    try:
        auth_hash = int(session_hash)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid session identifier.") from exc
    if auth_hash == 0:
        raise ValueError("Can't end the current session here — use Logout on the account row.")
    async with _client_op(manager, account_id) as (account, client):
        await client(ResetAuthorizationRequest(hash=auth_hash))
    log_event("account_session_terminated", "Session terminated", account.label, {"account_id": account.id})
    return {"ok": True}


async def terminate_other_sessions(manager: AccountManager, account_id: str) -> dict[str, Any]:
    async with _client_op(manager, account_id) as (account, client):
        await client(ResetAuthorizationsRequest())
    log_event(
        "account_sessions_reset",
        "All other sessions terminated",
        account.label,
        {"account_id": account.id},
    )
    return {"ok": True}


async def list_contacts(manager: AccountManager, account_id: str) -> dict[str, Any]:
    async with _client_op(manager, account_id) as (_account, client):
        result = await client(GetContactsRequest(hash=0))
    return {"contacts": [_user_dict(u) for u in getattr(result, "users", [])]}


async def add_contact(
    manager: AccountManager,
    account_id: str,
    *,
    identifier: str,
    first_name: str,
    last_name: str = "",
    phone: str = "",
) -> dict[str, Any]:
    identifier = identifier.strip()
    first_name = first_name.strip()
    if not identifier:
        raise ValueError("Provide a username, phone, or user ID to add.")
    if not first_name:
        raise ValueError("A first name is required to save a contact.")
    async with _client_op(manager, account_id) as (account, client):
        user = await client.get_input_entity(identifier)
        await client(
            AddContactRequest(
                id=user,
                first_name=first_name,
                last_name=last_name.strip(),
                phone=phone.strip(),
                add_phone_privacy_exception=False,
            )
        )
    log_event("account_contact_added", "Contact added", account.label, {"account_id": account.id})
    return {"ok": True}


async def delete_contact(manager: AccountManager, account_id: str, identifier: str) -> dict[str, Any]:
    identifier = identifier.strip()
    if not identifier:
        raise ValueError("Provide a contact to delete.")
    async with _client_op(manager, account_id) as (account, client):
        user = await client.get_input_entity(identifier)
        await client(DeleteContactsRequest(id=[user]))
    log_event("account_contact_deleted", "Contact deleted", account.label, {"account_id": account.id})
    return {"ok": True}


async def list_blocked(manager: AccountManager, account_id: str) -> dict[str, Any]:
    # ponytail: first 100 blocked users, no paging. Add offset paging if an
    # account ever blocks more than that (the UI notes the cap).
    async with _client_op(manager, account_id) as (_account, client):
        result = await client(GetBlockedRequest(offset=0, limit=100))
    return {"blocked": [_user_dict(u) for u in getattr(result, "users", [])]}


async def get_account_ttl(manager: AccountManager, account_id: str) -> dict[str, Any]:
    async with _client_op(manager, account_id) as (_account, client):
        result = await client(GetAccountTTLRequest())
    return {"days": getattr(result, "days", None)}


async def set_account_ttl(manager: AccountManager, account_id: str, days: int) -> dict[str, Any]:
    days = validate_ttl_days(days)
    async with _client_op(manager, account_id) as (account, client):
        await client(SetAccountTTLRequest(ttl=AccountDaysTTL(days=days)))
    log_event(
        "account_ttl_updated",
        "Account self-destruct period updated",
        account.label,
        {"account_id": account.id, "days": days},
    )
    return {"days": days}


async def set_profile_photo(
    manager: AccountManager, account_id: str, data: bytes, filename: str
) -> dict[str, Any]:
    if not data:
        raise ValueError("No image data was provided.")
    if len(data) > _MAX_PHOTO_BYTES:
        raise ValueError("Image must be under 10 MB.")
    async with _client_op(manager, account_id) as (account, client):
        uploaded = await client.upload_file(BytesIO(data), file_name=filename or "photo.jpg")
        await client(UploadProfilePhotoRequest(file=uploaded))
    log_event("account_photo_updated", "Profile photo updated", account.label, {"account_id": account.id})
    return {"ok": True}


async def delete_profile_photo(manager: AccountManager, account_id: str) -> dict[str, Any]:
    async with _client_op(manager, account_id) as (account, client):
        photos = await client.get_profile_photos("me", limit=1)
        if not photos:
            raise ValueError("This account has no profile photo to remove.")
        await client(DeletePhotosRequest(id=[telethon_utils.get_input_photo(photos[0])]))
    log_event("account_photo_deleted", "Profile photo removed", account.label, {"account_id": account.id})
    return {"ok": True}
