from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from telethon.errors import FloodWaitError
from telethon.tl.types import Channel, Chat, Message, User

from .accounts import AccountManager
from .app_settings import app_settings, resolve_photos_enabled
from .config import AVATARS_DIR, DIALOGS_DIR, ensure_dirs, now_iso, read_json, write_json
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
    # Locally-cached profile photo state. `photo_id` is the peer's current Telegram
    # photo id (used to skip re-downloading unchanged avatars and to bust the
    # browser cache); `has_photo` means a thumbnail file exists under AVATARS_DIR.
    photo_id: int | None = None
    has_photo: bool = False


def dialogs_path(account_id: str):
    ensure_dirs()
    return DIALOGS_DIR / f"{account_id}.json"


def avatar_dir(account_id: str) -> Path:
    return AVATARS_DIR / account_id


def avatar_path(account_id: str, dialog_id: int) -> Path:
    return avatar_dir(account_id) / f"{dialog_id}.jpg"


async def fetch_dialogs(manager: AccountManager, account_id: str, limit: int = 500) -> dict:
    account = manager._get_account(account_id)
    photos_enabled = resolve_photos_enabled(account, app_settings()["show_dialog_photos"])
    # Snapshot the prior cache once so unchanged avatars can be skipped (no redundant
    # Telegram traffic on a re-fetch). Only needed when photos are enabled.
    prev_photos = _previous_photo_index(account.id) if photos_enabled else {}
    async with manager.temp_client(account.id) as client:
        cached_dialogs: list[CachedDialog] = []
        async for dialog in client.iter_dialogs(limit=limit):
            cached = classify_dialog(dialog)
            if photos_enabled:
                await _ensure_dialog_photo(client, dialog.entity, account.id, cached, prev_photos)
            cached_dialogs.append(cached)

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


def _previous_photo_index(account_id: str) -> dict[Any, tuple[Any, bool]]:
    """Map of dialog id -> (photo_id, had_file) from the last cached fetch.

    Best-effort: a miss just means we re-download that avatar, never an error.
    """
    payload = read_json(dialogs_path(account_id), {})
    index: dict[Any, tuple[Any, bool]] = {}
    for item in payload.get("dialogs", []) or []:
        if isinstance(item, dict) and "id" in item:
            index[item["id"]] = (item.get("photo_id"), bool(item.get("has_photo")))
    return index


async def _ensure_dialog_photo(
    client: Any,
    entity: Any,
    account_id: str,
    cached: CachedDialog,
    prev_photos: dict[Any, tuple[Any, bool]],
) -> None:
    """Download a small profile-photo thumbnail for `cached` into AVATARS_DIR.

    Skips peers with no photo and avatars unchanged since the last fetch. A single
    failed/restricted/rate-limited download degrades to no photo and never aborts
    the surrounding fetch.
    """
    if cached.photo_id is None:
        return  # peer has no profile photo
    path = avatar_path(account_id, cached.id)
    prev_photo_id, had_file = prev_photos.get(cached.id, (None, False))
    if had_file and prev_photo_id == cached.photo_id and path.exists():
        cached.has_photo = True
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        result = await client.download_profile_photo(entity, file=str(path), download_big=False)
        cached.has_photo = result is not None
    except FloodWaitError:
        cached.has_photo = path.exists()  # keep any prior thumbnail; don't fail the fetch
    except Exception:
        cached.has_photo = path.exists()


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

    # Current Telegram photo id, or None when the peer has no photo (the *Empty
    # photo types carry no photo_id). Drives skip-unchanged + cache-busting; the
    # bytes themselves are downloaded separately in fetch_dialogs.
    photo = getattr(entity, "photo", None)
    photo_id = getattr(photo, "photo_id", None)

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
        photo_id=int(photo_id) if photo_id is not None else None,
    )
