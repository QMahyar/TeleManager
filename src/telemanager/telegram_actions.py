from __future__ import annotations

import asyncio
import re
from dataclasses import asdict, dataclass
from typing import Any, Literal, cast
from urllib.parse import parse_qs, urlparse

from telethon import TelegramClient
from telethon.tl.functions.channels import JoinChannelRequest, LeaveChannelRequest
from telethon.tl.functions.messages import DeleteHistoryRequest, ImportChatInviteRequest, StartBotRequest

TelegramActionType = Literal[
    "join_chat",
    "leave_chat",
    "send_message",
    "start_bot",
    "delete_chat",
    "clear_chat",
]


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

    if action.action_type == "join_chat":
        return await join_chat(client, target)
    if action.action_type == "leave_chat":
        return await leave_chat(client, target)
    if action.action_type == "send_message":
        return await send_message(client, target, action.message)
    if action.action_type == "start_bot":
        return await start_bot(client, target)
    if action.action_type == "delete_chat":
        return await delete_chat(client, target)
    if action.action_type == "clear_chat":
        return await clear_chat(client, target)
    raise ValueError(f"Unsupported action type: {action.action_type}")


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
