from __future__ import annotations

import asyncio
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any, Literal, cast
from urllib.parse import parse_qs, urlparse

from telethon import TelegramClient
from telethon.tl.functions.account import UpdateNotifySettingsRequest
from telethon.tl.functions.channels import JoinChannelRequest, LeaveChannelRequest
from telethon.tl.functions.contacts import BlockRequest, UnblockRequest
from telethon.tl.functions.messages import (
    DeleteHistoryRequest,
    ImportChatInviteRequest,
    ReadHistoryRequest,
    StartBotRequest,
)
from telethon.tl.types import InputNotifyPeer, InputPeerNotifySettings

TelegramActionType = Literal[
    "join_chat",
    "leave_chat",
    "send_message",
    "forward_message",
    "start_bot",
    "delete_chat",
    "clear_chat",
    "block_user",
    "unblock_user",
    "archive_chat",
    "unarchive_chat",
    "mute_chat",
    "unmute_chat",
    "read_chat",
    "report_spam",
]

ACTION_HANDLERS: dict[TelegramActionType, str] = {
    "join_chat": "join_chat",
    "leave_chat": "leave_chat",
    "send_message": "send_message",
    "forward_message": "forward_message",
    "start_bot": "start_bot",
    "delete_chat": "delete_chat",
    "clear_chat": "clear_chat",
    "block_user": "block_user",
    "unblock_user": "unblock_user",
    "archive_chat": "archive_chat",
    "unarchive_chat": "unarchive_chat",
    "mute_chat": "mute_chat",
    "unmute_chat": "unmute_chat",
    "read_chat": "read_chat",
    "report_spam": "report_spam",
}


@dataclass
class TelegramAction:
    action_type: TelegramActionType
    target: str
    account_ids: list[str]
    message: str | None = None
    confirm: bool = False
    delay_seconds: float = 2.5


@dataclass
class TelegramActionResult:
    account_id: str
    label: str
    ok: bool
    action_type: str
    detail: str

    def to_dict(self) -> dict:
        return asdict(self)


async def run_telegram_action(client: TelegramClient, action: TelegramAction) -> str:
    target = action.target.strip()
    if not target:
        raise ValueError("Target is required.")

    handlers = {
        "join_chat": lambda: join_chat(client, target),
        "leave_chat": lambda: leave_chat(client, target),
        "send_message": lambda: send_message(client, target, action.message),
        "forward_message": lambda: forward_message(client, target, action.message),
        "start_bot": lambda: start_bot(client, target),
        "delete_chat": lambda: delete_chat(client, target),
        "clear_chat": lambda: clear_chat(client, target),
        "block_user": lambda: block_user(client, target),
        "unblock_user": lambda: unblock_user(client, target),
        "archive_chat": lambda: archive_chat(client, target),
        "unarchive_chat": lambda: unarchive_chat(client, target),
        "mute_chat": lambda: mute_chat(client, target),
        "unmute_chat": lambda: unmute_chat(client, target),
        "read_chat": lambda: read_chat(client, target),
        "report_spam": lambda: report_spam(client, target),
    }
    handler = handlers.get(action.action_type)
    if not handler:
        raise ValueError(f"Unsupported action type: {action.action_type}")
    return await handler()


# ---------------------------------------------------------------------------
# Core actions (existing)
# ---------------------------------------------------------------------------


async def join_chat(client: TelegramClient, target: str) -> str:
    invite_hash = extract_invite_hash(target)
    if invite_hash:
        await client(ImportChatInviteRequest(invite_hash))
        return "Invite link joined or join request sent."

    channel = cast(Any, await client.get_input_entity(normalize_entity_target(target)))
    await client(JoinChannelRequest(channel))
    return "Public channel/group joined or join request sent."


async def leave_chat(client: TelegramClient, target: str) -> str:
    entity = cast(Any, await client.get_input_entity(normalize_entity_target(target)))
    try:
        await client(LeaveChannelRequest(entity))
        return "Channel or supergroup left."
    except Exception:
        await client.delete_dialog(entity, revoke=False)
        return "Dialog deleted or basic group left."


async def send_message(client: TelegramClient, target: str, message: str | None) -> str:
    clean_message = (message or "").strip()
    if not clean_message:
        raise ValueError("Message text is required for messaging actions.")
    await client.send_message(normalize_entity_target(target), clean_message)
    return "Message sent."


async def forward_message(client: TelegramClient, target: str, message: str | None) -> str:
    source_info = (message or "").strip()
    if not source_info:
        raise ValueError("Source chat and message ID are required. Format: @source_chat:message_id")
    parts = source_info.split(":", 1)
    if len(parts) != 2 or not parts[1].strip().isdigit():
        raise ValueError("Format must be @source_chat:message_id (e.g. @channel:12345)")
    source_chat = parts[0].strip()
    message_id = int(parts[1].strip())
    dest = normalize_entity_target(target)
    await client.forward_messages(dest, message_id, source_chat)
    return f"Message {message_id} forwarded from {source_chat}."


async def start_bot(client: TelegramClient, target: str) -> str:
    bot, start_param = parse_bot_start(target)
    if start_param:
        bot_entity = cast(Any, await client.get_input_entity(bot))
        await client(StartBotRequest(bot=bot_entity, peer=bot_entity, start_param=start_param))
        return "Bot started with start parameter."

    await client.send_message(bot, "/start")
    return "Bot started without parameter."


async def delete_chat(client: TelegramClient, target: str) -> str:
    entity = cast(Any, await client.get_input_entity(normalize_entity_target(target)))
    await client.delete_dialog(entity, revoke=False)
    return "Dialog deleted locally."


async def clear_chat(client: TelegramClient, target: str) -> str:
    entity = cast(Any, await client.get_input_entity(normalize_entity_target(target)))
    try:
        await client(DeleteHistoryRequest(peer=entity, max_id=0, revoke=False))
    except TypeError:
        await client.delete_dialog(entity, revoke=False)
    return "Chat history cleared locally where Telegram permits it."


# ---------------------------------------------------------------------------
# New actions
# ---------------------------------------------------------------------------


async def block_user(client: TelegramClient, target: str) -> str:
    entity = await client.get_input_entity(normalize_entity_target(target))
    await client(BlockRequest(id=entity))
    return "User blocked."


async def unblock_user(client: TelegramClient, target: str) -> str:
    entity = await client.get_input_entity(normalize_entity_target(target))
    await client(UnblockRequest(id=entity))
    return "User unblocked."


async def archive_chat(client: TelegramClient, target: str) -> str:
    entity = await client.get_entity(normalize_entity_target(target))
    await client.edit_folder(entity, folder=1)
    return "Chat archived."


async def unarchive_chat(client: TelegramClient, target: str) -> str:
    entity = await client.get_entity(normalize_entity_target(target))
    await client.edit_folder(entity, folder=0)
    return "Chat unarchived."


async def mute_chat(client: TelegramClient, target: str) -> str:
    entity = await client.get_input_entity(normalize_entity_target(target))
    far_future = datetime(2038, 1, 1, tzinfo=UTC)
    await client(
        UpdateNotifySettingsRequest(
            peer=InputNotifyPeer(peer=entity),
            settings=InputPeerNotifySettings(mute_until=far_future),
        )
    )
    return "Chat muted."


async def unmute_chat(client: TelegramClient, target: str) -> str:
    entity = await client.get_input_entity(normalize_entity_target(target))
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    await client(
        UpdateNotifySettingsRequest(
            peer=InputNotifyPeer(peer=entity),
            settings=InputPeerNotifySettings(mute_until=epoch),
        )
    )
    return "Chat unmuted."


async def read_chat(client: TelegramClient, target: str) -> str:
    entity = await client.get_input_entity(normalize_entity_target(target))
    await client(ReadHistoryRequest(peer=entity, max_id=0))
    return "Chat marked as read."


async def report_spam(client: TelegramClient, target: str) -> str:
    entity = await client.get_input_entity(normalize_entity_target(target))
    from telethon.tl.functions.messages import ReportSpamRequest

    await client(ReportSpamRequest(peer=entity))
    return "Spam reported."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def safe_delay(seconds: float) -> None:
    await asyncio.sleep(max(0.0, min(seconds, 30.0)))


def normalize_entity_target(target: str) -> str:
    clean = target.strip()
    parsed = urlparse(clean)
    if parsed.netloc in {"t.me", "telegram.me", "www.t.me", "www.telegram.me"}:
        path = parsed.path.strip("/")
        if path:
            return path.split("/")[0]
    return clean


def extract_invite_hash(target: str) -> str | None:
    clean = target.strip()
    parsed = urlparse(clean)
    if parsed.netloc not in {"t.me", "telegram.me", "www.t.me", "www.telegram.me"}:
        return None

    path = parsed.path.strip("/")
    if path.startswith("joinchat/"):
        return path.split("/", 1)[1]
    if path.startswith("+"):
        return path[1:]
    return None


def parse_bot_start(target: str) -> tuple[str, str]:
    clean = target.strip()
    parsed = urlparse(clean)
    if parsed.netloc in {"t.me", "telegram.me", "www.t.me", "www.telegram.me"}:
        bot = parsed.path.strip("/").split("/")[0]
        params = parse_qs(parsed.query)
        start_param = params.get("start", [""])[0]
        if not bot:
            raise ValueError("Bot username was not found in the link.")
        return bot, start_param

    match = re.match(r"^@?([A-Za-z0-9_]{5,})(?:\s+(.+))?$", clean)
    if match:
        return match.group(1), (match.group(2) or "").strip()
    return clean.lstrip("@"), ""


# ---------------------------------------------------------------------------
# Target validation rules per action type
# ---------------------------------------------------------------------------

TARGET_KIND_USERNAME = "username"
TARGET_KIND_NUMERIC = "numeric_id"
TARGET_KIND_INVITE_LINK = "invite_link"
TARGET_KIND_PUBLIC_LINK = "public_link"
TARGET_KIND_BOT_LINK = "bot_link"
TARGET_KIND_UNKNOWN = "unknown"


def classify_target_kind(target: str) -> str:
    clean = target.strip()
    parsed = urlparse(clean)
    is_tme = parsed.netloc in {"t.me", "telegram.me", "www.t.me", "www.telegram.me"}

    if is_tme:
        path = parsed.path.strip("/")
        if path.startswith("+") or path.startswith("joinchat/"):
            return TARGET_KIND_INVITE_LINK
        qs = parse_qs(parsed.query)
        if qs.get("start"):
            return TARGET_KIND_BOT_LINK
        if path:
            return TARGET_KIND_PUBLIC_LINK
        return TARGET_KIND_UNKNOWN

    if re.match(r"^@?[A-Za-z0-9_]{5,32}$", clean):
        return TARGET_KIND_USERNAME

    if re.match(r"^-?\d+$", clean):
        return TARGET_KIND_NUMERIC

    return TARGET_KIND_UNKNOWN


VALID_TARGETS: dict[TelegramActionType, set[str]] = {
    "join_chat": {TARGET_KIND_INVITE_LINK, TARGET_KIND_PUBLIC_LINK, TARGET_KIND_USERNAME},
    "leave_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "send_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "forward_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "start_bot": {TARGET_KIND_USERNAME, TARGET_KIND_BOT_LINK},
    "delete_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "clear_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "block_user": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC},
    "unblock_user": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC},
    "archive_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "unarchive_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "mute_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "unmute_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "read_chat": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "report_spam": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
}


def validate_target_for_action(action_type: TelegramActionType, target: str) -> str | None:
    """Return an error message if the target is invalid for the action, or None if OK."""
    kind = classify_target_kind(target)
    if kind == TARGET_KIND_UNKNOWN:
        return None  # let Telegram decide
    allowed = VALID_TARGETS.get(action_type)
    if allowed and kind not in allowed:
        return f"Target '{target}' ({kind.replace('_', ' ')}) is not valid for {action_type.replace('_', ' ')}."
    return None
