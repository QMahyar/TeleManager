from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from telethon.tl.types import Channel, Chat, Message, User

from .accounts import AccountManager
from .config import DIALOGS_DIR, ensure_dirs, now_iso, read_json, write_json
from .telegram_actions import resolve_input_peer
from .telegram_ids import mark_chat_id, marked_dialog_record


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


async def fetch_dialogs(manager: AccountManager, account_id: str, limit: int = 500) -> dict:
    account = manager._get_account(account_id)
    async with manager.temp_client(account.id) as client:
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


def list_cached_dialogs(manager: AccountManager, account_id: str) -> dict:
    account = manager._get_account(account_id)
    payload = read_json(
        dialogs_path(account.id),
        {"account_id": account.id, "account_label": account.label, "fetched_at": None, "dialogs": []},
    )
    dialogs = payload.get("dialogs")
    if isinstance(dialogs, list):
        # Migrate legacy caches that stored the bare entity id to the marked form,
        # so old fetches resolve the right peer without a re-fetch.
        payload["dialogs"] = [
            marked_dialog_record(item) if isinstance(item, dict) else item
            for item in dialogs
        ]
    return payload


def message_to_dict(message: Message) -> dict:
    sender = getattr(message, "sender", None)
    sender_name = getattr(sender, "username", None) or " ".join(
        part for part in [getattr(sender, "first_name", None), getattr(sender, "last_name", None)] if part
    )
    return {
        "id": message.id,
        "date": message.date.isoformat() if message.date else None,
        "text": message.message or "",
        "sender_id": getattr(message, "sender_id", None),
        "sender_name": sender_name,
        "out": bool(getattr(message, "out", False)),
        "has_media": bool(getattr(message, "media", None)),
    }


async def fetch_messages(manager: AccountManager, account_id: str, target: str, limit: int = 50) -> dict:
    account = manager._get_account(account_id)
    async with manager.temp_client(account.id) as client:
        peer = await resolve_input_peer(client, target)
        raw_messages: Any = await client.get_messages(peer, limit=max(1, min(limit, 100)))
        if raw_messages is None:
            messages = []
        elif isinstance(raw_messages, list):
            messages = raw_messages
        else:
            messages = list(raw_messages)
        return {
            "account_id": account.id,
            "account_label": account.label,
            "target": target,
            "messages": [message_to_dict(message) for message in messages if message],
        }


def classify_dialog(dialog: Any) -> CachedDialog:
    entity = dialog.entity
    username = getattr(entity, "username", None)
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

    # Store the marked id (-100… for channels/supergroups, -id for basic groups)
    # so a username-less chat resolves against the session cache, which is keyed
    # by the marked id. Users/bots keep their positive id.
    marked_id = mark_chat_id(
        int(getattr(entity, "id", 0)),
        is_channel=is_channel,
        is_basic_group=isinstance(entity, Chat),
    )
    title = dialog.name or username or str(marked_id)

    return CachedDialog(
        id=marked_id,
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
