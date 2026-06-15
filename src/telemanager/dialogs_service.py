from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from telethon.tl.types import Channel, Chat, User

from .accounts import AccountManager
from .config import DIALOGS_DIR, ensure_dirs, read_json, write_json


@dataclass
class CachedDialog:
    id: int
    title: str
    dialog_type: str
    username: str | None = None
    unread_count: int = 0
    pinned: bool = False
    archived: bool = False
    is_user: bool = False
    is_bot: bool = False
    is_group: bool = False
    is_channel: bool = False
    is_megagroup: bool = False
    is_broadcast: bool = False


def dialogs_path(account_id: str):
    ensure_dirs()
    return DIALOGS_DIR / f"{account_id}.json"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def fetch_dialogs(manager: AccountManager, account_id: str, limit: int = 500) -> dict:
    account = manager._get_account(account_id)
    api_id, api_hash = manager.get_api_credentials()
    client = manager._new_client(account.session_name, api_id, api_hash)
    await manager._connect_client(client)
    try:
        if not await manager._is_user_authorized(client):
            account.authorized = False
            account.last_error = "Session is not authorized. Log in again."
            manager._save_accounts()
            raise ValueError(account.last_error)

        cached_dialogs: list[CachedDialog] = []
        async for dialog in client.iter_dialogs(limit=limit):
            cached_dialogs.append(classify_dialog(dialog))

        fetched_at = now_iso()
        payload = {
            "account_id": account.id,
            "account_label": account.label,
            "fetched_at": fetched_at,
            "dialogs": [asdict(dialog) for dialog in cached_dialogs],
        }
        write_json(dialogs_path(account.id), payload)
        account.dialog_count = len(cached_dialogs)
        account.last_dialog_fetch_at = fetched_at
        account.last_error = None
        manager._save_accounts()
        return payload
    finally:
        client.disconnect()


def list_cached_dialogs(manager: AccountManager, account_id: str) -> dict:
    account = manager._get_account(account_id)
    return read_json(
        dialogs_path(account.id),
        {"account_id": account.id, "account_label": account.label, "fetched_at": None, "dialogs": []},
    )


def classify_dialog(dialog: Any) -> CachedDialog:
    entity = dialog.entity
    username = getattr(entity, "username", None)
    title = dialog.name or username or str(getattr(entity, "id", "Unknown"))
    dialog_type = "unknown"
    is_user = isinstance(entity, User)
    is_bot = bool(getattr(entity, "bot", False))
    is_group = False
    is_channel = isinstance(entity, Channel)
    is_megagroup = bool(getattr(entity, "megagroup", False))
    is_broadcast = bool(getattr(entity, "broadcast", False))

    if is_bot:
        dialog_type = "bot"
    elif is_user:
        dialog_type = "personal"
    elif isinstance(entity, Chat):
        dialog_type = "group"
        is_group = True
    elif is_channel and is_megagroup:
        dialog_type = "supergroup"
        is_group = True
    elif is_channel and is_broadcast:
        dialog_type = "channel"
    elif is_channel:
        dialog_type = "channel"

    return CachedDialog(
        id=int(getattr(entity, "id", 0)),
        title=title,
        dialog_type=dialog_type,
        username=username,
        unread_count=int(getattr(dialog, "unread_count", 0) or 0),
        pinned=bool(getattr(dialog, "pinned", False)),
        archived=bool(getattr(dialog, "archived", False)),
        is_user=is_user,
        is_bot=is_bot,
        is_group=is_group,
        is_channel=is_channel,
        is_megagroup=is_megagroup,
        is_broadcast=is_broadcast,
    )
