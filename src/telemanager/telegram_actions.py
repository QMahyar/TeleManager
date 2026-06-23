from __future__ import annotations

import asyncio
import re
import struct
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, cast
from urllib.parse import parse_qs, urlparse

from telethon import TelegramClient
from telethon import utils as telethon_utils
from telethon.errors import FloodWaitError
from telethon.tl.functions.account import ReportPeerRequest, UpdateNotifySettingsRequest
from telethon.tl.functions.channels import JoinChannelRequest, LeaveChannelRequest
from telethon.tl.functions.contacts import BlockRequest, UnblockRequest
from telethon.tl.functions.messages import (
    DeleteHistoryRequest,
    DeleteScheduledMessagesRequest,
    GetScheduledHistoryRequest,
    ImportChatInviteRequest,
    RequestAppWebViewRequest,
    RequestMainWebViewRequest,
    StartBotRequest,
)
from telethon.tl.types import (
    InputBotAppShortName,
    InputNotifyPeer,
    InputPeerNotifySettings,
    InputReportReasonSpam,
)

from .config import DOWNLOADS_DIR

TelegramActionType = Literal[
    "join_chat",
    "leave_chat",
    "send_message",
    "send_media",
    "schedule_message",
    "forward_message",
    "edit_message",
    "delete_messages",
    "pin_message",
    "unpin_message",
    "download_media",
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


@dataclass
class BotStartTarget:
    """Resolved bot-start request parsed from a target plus optional options.

    mode is "start" for classic messages.startBot referrals (?start=) and
    "startapp" for mini-app referrals (?startapp=), which must go through the
    web-view methods to actually credit the referral.
    """

    bot: str
    param: str = ""
    mode: Literal["start", "startapp"] = "start"
    app_short_name: str = ""


async def run_telegram_action(client: TelegramClient, action: TelegramAction) -> str:
    target = action.target.strip()
    if not target:
        raise ValueError("Target is required.")

    match action.action_type:
        case "join_chat":
            return await join_chat(client, target)
        case "leave_chat":
            return await leave_chat(client, target)
        case "send_message":
            return await send_message(client, target, action.message)
        case "send_media":
            return await send_media(client, target, action.message)
        case "schedule_message":
            return await schedule_message(client, target, action.message)
        case "forward_message":
            return await forward_message(client, target, action.message)
        case "edit_message":
            return await edit_message(client, target, action.message)
        case "delete_messages":
            return await delete_messages(client, target, action.message)
        case "pin_message":
            return await pin_message(client, target, action.message)
        case "unpin_message":
            return await unpin_message(client, target, action.message)
        case "download_media":
            return await download_media(client, target, action.message)
        case "start_bot":
            return await start_bot(client, target, action.message)
        case "delete_chat":
            return await delete_chat(client, target)
        case "clear_chat":
            return await clear_chat(client, target)
        case "block_user":
            return await block_user(client, target)
        case "unblock_user":
            return await unblock_user(client, target)
        case "archive_chat":
            return await archive_chat(client, target)
        case "unarchive_chat":
            return await unarchive_chat(client, target)
        case "mute_chat":
            return await mute_chat(client, target)
        case "unmute_chat":
            return await unmute_chat(client, target)
        case "read_chat":
            return await read_chat(client, target)
        case "report_spam":
            return await report_spam(client, target)
    raise ValueError(f"Unsupported action type: {action.action_type}")


# ---------------------------------------------------------------------------
# Core actions (existing)
# ---------------------------------------------------------------------------


async def join_chat(client: TelegramClient, target: str) -> str:
    invite_hash = extract_invite_hash(target)
    if invite_hash:
        await client(ImportChatInviteRequest(invite_hash))
        return "Invite link joined or join request sent."

    channel = cast(Any, await resolve_input_peer(client, target))
    await client(JoinChannelRequest(channel))
    return "Public channel/group joined or join request sent."


async def leave_chat(client: TelegramClient, target: str) -> str:
    entity = cast(Any, await resolve_input_peer(client, target))
    try:
        await client(LeaveChannelRequest(entity))
        return "Channel or supergroup left."
    except (TypeError, ValueError, struct.error):
        # LeaveChannelRequest only accepts channels/supergroups. Basic groups and
        # private dialogs raise on serialization, so fall back to leaving the dialog.
        await client.delete_dialog(entity, revoke=False)
        return "Dialog deleted or basic group left."


async def send_message(client: TelegramClient, target: str, message: str | None) -> str:
    clean_message = (message or "").strip()
    if not clean_message:
        raise ValueError("Message text is required for messaging actions.")
    await client.send_message(await resolve_input_peer(client, target), clean_message)
    return "Message sent."


async def send_media(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    file_path = (payload.get("file") or payload.get("path") or "").strip()
    if not file_path:
        raise ValueError("Media action requires file=PATH in the message/options field.")
    caption = payload.get("caption") or payload.get("message") or ""
    parse_mode = payload.get("parse_mode")
    peer = await resolve_input_peer(client, target)
    if parse_mode:
        await client.send_file(peer, file=file_path, caption=caption, parse_mode=parse_mode)
    else:
        await client.send_file(peer, file=file_path, caption=caption)
    return "Media sent."


async def schedule_message(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    text = (payload.get("text") or payload.get("message") or "").strip()
    if not text:
        raise ValueError("Scheduled messages require text=...")
    schedule = parse_schedule(payload.get("schedule") or payload.get("at") or payload.get("when"))
    await client.send_message(await resolve_input_peer(client, target), text, schedule=schedule)
    return f"Message scheduled for {schedule.isoformat()}."


# ---------------------------------------------------------------------------
# Native scheduled-message buffer (used by the recurring scheduler)
#
# Telegram delivers server-side scheduled messages even while TeleManager is
# closed, but caps them at 100 per chat (365 days out). The recurring scheduler
# keeps a rolling buffer of upcoming sends pre-scheduled here and tops it up
# whenever the app is running. These helpers are intentionally thin wrappers so
# the scheduler can reconcile (list -> add missing -> delete stale) idempotently.
# ---------------------------------------------------------------------------

TELEGRAM_SCHEDULED_PER_CHAT_LIMIT = 100


async def create_scheduled_text(client: TelegramClient, target: str, text: str, when: datetime) -> int:
    """Create one Telegram-native scheduled message and return its message id."""
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("Scheduled messages require non-empty text.")
    peer = await resolve_input_peer(client, target)
    sent = cast(Any, await client.send_message(peer, clean_text, schedule=when))
    return int(sent.id)


async def list_scheduled_message_times(client: TelegramClient, target: str) -> dict[int, datetime]:
    """Return {message_id: scheduled_send_time} for the chat's scheduled messages."""
    entity = await resolve_input_peer(client, target)
    result = cast(Any, await client(GetScheduledHistoryRequest(peer=entity, hash=0)))
    messages = getattr(result, "messages", []) or []
    times: dict[int, datetime] = {}
    for message in messages:
        message_id = getattr(message, "id", None)
        scheduled_at = getattr(message, "date", None)
        if message_id is None or scheduled_at is None:
            continue
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=UTC)
        times[int(message_id)] = scheduled_at
    return times


async def delete_scheduled_messages(client: TelegramClient, target: str, message_ids: list[int]) -> None:
    """Delete the given scheduled messages from a chat. No-op when the list is empty."""
    ids = [int(message_id) for message_id in message_ids]
    if not ids:
        return
    entity = await resolve_input_peer(client, target)
    await client(DeleteScheduledMessagesRequest(peer=entity, id=ids))


async def fetch_scheduled_messages(client: TelegramClient, target: str) -> list[dict[str, Any]]:
    """Return the chat's scheduled messages as {id, date, text} dicts for review."""
    entity = await resolve_input_peer(client, target)
    result = cast(Any, await client(GetScheduledHistoryRequest(peer=entity, hash=0)))
    messages = getattr(result, "messages", []) or []
    rows: list[dict[str, Any]] = []
    for message in messages:
        message_id = getattr(message, "id", None)
        if message_id is None:
            continue
        scheduled_at = getattr(message, "date", None)
        if scheduled_at is not None and scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=UTC)
        rows.append(
            {
                "id": int(message_id),
                "date": scheduled_at.astimezone(UTC).isoformat() if scheduled_at else None,
                "text": (getattr(message, "message", "") or "")[:200],
            }
        )
    rows.sort(key=lambda row: row.get("date") or "")
    return rows


async def edit_message(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    message_id = parse_message_id(payload.get("id") or payload.get("message_id"))
    text = (payload.get("text") or payload.get("message") or "").strip()
    if not text:
        raise ValueError("Edit message requires text=...")
    await client.edit_message(await resolve_input_peer(client, target), cast(Any, message_id), text)
    return f"Message {message_id} edited."


async def delete_messages(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    ids = parse_message_ids(payload.get("ids") or payload.get("message_ids") or payload.get("id"))
    revoke = parse_bool(payload.get("revoke"), default=True)
    await client.delete_messages(await resolve_input_peer(client, target), ids, revoke=revoke)
    return f"Deleted {len(ids)} message(s)."


async def pin_message(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    message_id = parse_message_id(payload.get("id") or payload.get("message_id"))
    notify = parse_bool(payload.get("notify"), default=False)
    await client.pin_message(await resolve_input_peer(client, target), message_id, notify=notify)
    return f"Message {message_id} pinned."


async def unpin_message(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    raw_id = payload.get("id") or payload.get("message_id")
    message_id = parse_message_id(raw_id) if raw_id else None
    await client.unpin_message(await resolve_input_peer(client, target), message_id)
    return "Message unpinned." if message_id else "All messages unpinned."


async def download_media(client: TelegramClient, target: str, message: str | None) -> str:
    payload = parse_options(message)
    message_id = parse_message_id(payload.get("id") or payload.get("message_id"))
    message_obj = await client.get_messages(await resolve_input_peer(client, target), ids=message_id)
    if not message_obj:
        raise ValueError(f"Message {message_id} was not found.")
    account_dir = DOWNLOADS_DIR / safe_path_name(target)
    account_dir.mkdir(parents=True, exist_ok=True)
    saved_path = await client.download_media(cast(Any, message_obj), file=str(account_dir))
    if not saved_path:
        raise ValueError("Message has no downloadable media.")
    return f"Media downloaded to {saved_path}."


async def forward_message(client: TelegramClient, target: str, message: str | None) -> str:
    source_chat, message_ids = parse_forward_source(message)
    dest = await resolve_input_peer(client, target)
    source = await resolve_input_peer(client, source_chat)
    await client.forward_messages(dest, message_ids, source)
    if len(message_ids) == 1:
        return f"Message {message_ids[0]} forwarded from {source_chat}."
    return f"{len(message_ids)} messages forwarded from {source_chat}."


async def start_bot(client: TelegramClient, target: str, message: str | None = None) -> str:
    spec = parse_bot_start(target, message)

    if spec.mode == "startapp":
        return await start_bot_mini_app(client, spec)

    if spec.param:
        bot_entity = cast(Any, await client.get_input_entity(spec.bot))
        await client(StartBotRequest(bot=bot_entity, peer=bot_entity, start_param=spec.param))
        return f"Bot started with referral parameter '{spec.param}'."

    await client.send_message(spec.bot, "/start")
    return "Bot started without parameter."


async def start_bot_mini_app(client: TelegramClient, spec: BotStartTarget) -> str:
    """Open a bot mini app so a ?startapp= referral is credited.

    Referral links for tap-to-earn / Stars affiliate bots use startapp, which is
    delivered through the web-view methods rather than messages.startBot. Calling
    startBot for these would start the bot but never register the referral.
    """
    bot_entity = cast(Any, await client.get_input_entity(spec.bot))
    if spec.app_short_name:
        app = InputBotAppShortName(bot_id=bot_entity, short_name=spec.app_short_name)
        await client(
            RequestAppWebViewRequest(
                peer=bot_entity,
                app=cast(Any, app),
                platform="web",
                start_param=spec.param or None,
            )
        )
        label = f"{spec.bot}/{spec.app_short_name}"
    else:
        await client(
            RequestMainWebViewRequest(
                peer=bot_entity,
                bot=bot_entity,
                platform="web",
                start_param=spec.param or None,
            )
        )
        label = spec.bot
    suffix = f" with referral parameter '{spec.param}'." if spec.param else "."
    return f"Bot mini app {label} opened{suffix}"


async def delete_chat(client: TelegramClient, target: str) -> str:
    entity = cast(Any, await resolve_input_peer(client, target))
    await client.delete_dialog(entity, revoke=False)
    return "Dialog deleted locally."


async def clear_chat(client: TelegramClient, target: str) -> str:
    entity = cast(Any, await resolve_input_peer(client, target))
    # just_clear=True wipes the message history but keeps the dialog in the chat list.
    # Without it, deleteHistory removes the dialog entirely (same as delete_chat).
    await client(DeleteHistoryRequest(peer=entity, max_id=0, just_clear=True, revoke=False))
    return "Chat history cleared locally where Telegram permits it."


# ---------------------------------------------------------------------------
# New actions
# ---------------------------------------------------------------------------


async def block_user(client: TelegramClient, target: str) -> str:
    entity = await resolve_input_peer(client, target)
    await client(BlockRequest(id=entity))
    return "User blocked."


async def unblock_user(client: TelegramClient, target: str) -> str:
    entity = await resolve_input_peer(client, target)
    await client(UnblockRequest(id=entity))
    return "User unblocked."


async def archive_chat(client: TelegramClient, target: str) -> str:
    entity = await resolve_full_entity(client, target)
    await client.edit_folder(entity, folder=1)
    return "Chat archived."


async def unarchive_chat(client: TelegramClient, target: str) -> str:
    entity = await resolve_full_entity(client, target)
    await client.edit_folder(entity, folder=0)
    return "Chat unarchived."


async def mute_chat(client: TelegramClient, target: str) -> str:
    entity = await resolve_input_peer(client, target)
    far_future = datetime(2038, 1, 1, tzinfo=UTC)
    await client(
        UpdateNotifySettingsRequest(
            peer=InputNotifyPeer(peer=entity),
            settings=InputPeerNotifySettings(mute_until=far_future),
        )
    )
    return "Chat muted."


async def unmute_chat(client: TelegramClient, target: str) -> str:
    entity = await resolve_input_peer(client, target)
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    await client(
        UpdateNotifySettingsRequest(
            peer=InputNotifyPeer(peer=entity),
            settings=InputPeerNotifySettings(mute_until=epoch),
        )
    )
    return "Chat unmuted."


async def read_chat(client: TelegramClient, target: str) -> str:
    # send_read_acknowledge dispatches to channels.ReadHistoryRequest for
    # channels/supergroups and messages.ReadHistoryRequest for users/basic
    # groups. Calling messages.ReadHistoryRequest directly fails on channels.
    await client.send_read_acknowledge(await resolve_input_peer(client, target))
    return "Chat marked as read."


async def report_spam(client: TelegramClient, target: str) -> str:
    entity = await resolve_input_peer(client, target)
    await client(
        ReportPeerRequest(
            peer=entity,
            reason=InputReportReasonSpam(),
            message="Reported as spam from TeleManager.",
        )
    )
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


_NUMERIC_TARGET_RE = re.compile(r"^-?\d+$")


def _numeric_target_candidates(value: int) -> list[int]:
    """Ordered ID forms to try against Telethon's session cache for a numeric target.

    The dialog cache (and therefore the UI) exposes Telethon's *raw* entity.id, so a
    supergroup/channel shows up as e.g. 1424486089 even though the session only knows
    it under its marked id -1001424486089.

    The unmarked positive id is tried first because Telethon resolves a *positive* int
    by checking every peer marking (user/chat/channel) against the cache and validating
    the type. A *negative* bare id such as -1424486089 is dangerous as a first guess: in
    the chat-id range Telethon returns an unvalidated InputPeerChat without ever
    consulting the cache, so a negated channel id would silently resolve to the wrong
    peer. We therefore lead with the positive form and keep the original value only as a
    fallback (it still resolves a correctly-marked, not-yet-cached public channel via
    channels.getChannels).
    """
    real, _ = telethon_utils.resolve_id(value)
    candidates = [real]
    if value != real:
        candidates.append(value)
    return candidates


async def _prime_dialog_cache(client: TelegramClient) -> bool:
    """Populate this client's session entity cache from its own dialog list, once.

    A bare numeric id can only be resolved from peers the account has already
    encountered, because Telegram requires that account's own access_hash for the
    peer. When a queued action runs on several accounts but the chat was browsed
    (and therefore cached) on only one of them, the others fail to resolve the id.
    Fetching dialogs caches every chat the account belongs to — so a retry then
    succeeds for any account that is actually a member. Idempotent per client, and
    only triggered on a numeric cache miss, so accounts that already have the chat
    cached pay nothing.

    Returns True if a prime was attempted (i.e. a retry is worth making).
    """
    if getattr(client, "_tm_dialogs_primed", False):
        return False
    client._tm_dialogs_primed = True  # noqa: SLF001 — mark this run's client primed once
    try:
        await client.get_dialogs(limit=500)
    except FloodWaitError:
        # Let the queue back off rather than masking a rate limit as "not found".
        raise
    except Exception:
        # Priming is best-effort; the caller still raises a helpful error if the
        # retry can't resolve the target.
        pass
    return True


async def _resolve_numeric_target(client: TelegramClient, normalized: str, resolver: Any) -> Any:
    """Try the numeric id forms against `resolver`, priming the dialog cache once
    on a miss before giving up. Shared by the input-peer and full-entity paths."""
    value = int(normalized)
    last_error: Exception | None = None
    for attempt in range(2):
        for candidate in _numeric_target_candidates(value):
            try:
                return await resolver(candidate)
            except (ValueError, TypeError, struct.error) as exc:
                last_error = exc
        # First miss: the account may simply not have this chat cached yet. Prime
        # its dialogs once and retry; if priming isn't possible, stop.
        if attempt == 0 and not await _prime_dialog_cache(client):
            break
    raise ValueError(
        f"Could not resolve the chat for ID {normalized}. This account may not be a "
        f"member of that chat — use its @username or t.me link to target it across "
        f"accounts."
    ) from last_error


async def resolve_input_peer(client: TelegramClient, target: str) -> Any:
    """Resolve a target string to a Telethon input peer.

    Usernames, t.me links and phone numbers pass straight through to Telethon, but
    bare numeric ids are converted to int first. Telethon never coerces a numeric
    *string* to an int, so without this a raw channel/supergroup id (1424486089) or a
    negative id (-1424486089) fails to resolve even when the chat is cached.
    """
    normalized = normalize_entity_target(target)
    if not _NUMERIC_TARGET_RE.match(normalized):
        return await client.get_input_entity(normalized)
    return await _resolve_numeric_target(client, normalized, client.get_input_entity)


async def resolve_full_entity(client: TelegramClient, target: str) -> Any:
    """Like resolve_input_peer but returns the full entity (with title/username/type)."""
    normalized = normalize_entity_target(target)
    if not _NUMERIC_TARGET_RE.match(normalized):
        return await client.get_entity(normalized)
    return await _resolve_numeric_target(client, normalized, client.get_entity)


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


START_PARAM_MAX_LENGTH = 64
START_PARAM_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
_TME_HOSTS = {"t.me", "telegram.me", "www.t.me", "www.telegram.me"}


def validate_start_param(param: str, mode: str) -> str:
    """Validate a referral parameter. Classic ?start= is capped at 64 base64url
    chars by Telegram; mini-app ?startapp= has no documented charset/length limit
    so it is passed through after a length guard only.
    """
    clean = param.strip()
    if not clean:
        return ""
    if mode == "start":
        if len(clean) > START_PARAM_MAX_LENGTH:
            raise ValueError(
                f"Referral parameter is {len(clean)} chars; Telegram allows at most {START_PARAM_MAX_LENGTH}."
            )
        if not START_PARAM_PATTERN.match(clean):
            raise ValueError("Referral parameter may only contain letters, digits, '_' and '-'.")
    elif len(clean) > 512:
        raise ValueError("Mini app referral parameter is unusually long (over 512 chars).")
    return clean


def parse_bot_start(target: str, message: str | None = None) -> BotStartTarget:
    """Resolve a bot username plus referral parameter from a target and options.

    Precedence for the parameter: explicit start=/startapp= option in the message
    field, then the link query string, then a space-separated suffix on a bare
    username. Supports t.me, telegram.me, and tg://resolve links, including
    named mini apps at t.me/<bot>/<app>?startapp=...
    """
    options = parse_options(message)
    bot, link_param, mode, app_short_name = _parse_bot_link(target.strip())

    param = link_param
    if "startapp" in options:
        param, mode = options["startapp"], "startapp"
    elif "start" in options:
        param, mode = options["start"], "start"
    elif options.get("param"):
        param = options["param"]
    elif options.get("message") and not link_param:
        # A bare value typed into the referral field with no key= prefix.
        param = options["message"].strip()

    if not bot:
        raise ValueError("Bot username was not found in the target.")

    param = validate_start_param(param, mode)
    return BotStartTarget(bot=bot, param=param, mode=mode, app_short_name=app_short_name)


def _parse_bot_link(clean: str) -> tuple[str, str, Literal["start", "startapp"], str]:
    parsed = urlparse(clean)
    mode: Literal["start", "startapp"] = "start"

    if parsed.scheme == "tg" and parsed.netloc == "resolve":
        params = parse_qs(parsed.query)
        bot = params.get("domain", [""])[0]
        app_short_name = params.get("appname", [""])[0]
        if "startapp" in params or app_short_name:
            return bot, params.get("startapp", [""])[0], "startapp", app_short_name
        return bot, params.get("start", [""])[0], "start", ""

    if parsed.netloc in _TME_HOSTS:
        segments = [segment for segment in parsed.path.split("/") if segment]
        bot = segments[0] if segments else ""
        # A numeric second segment is a message id (t.me/channel/123), not an app.
        app_short_name = segments[1] if len(segments) > 1 and not segments[1].isdigit() else ""
        params = parse_qs(parsed.query)
        if "startapp" in params or app_short_name:
            return bot, params.get("startapp", [""])[0], "startapp", app_short_name
        return bot, params.get("start", [""])[0], "start", ""

    match = re.match(r"^@?([A-Za-z0-9_]{4,})(?:\s+(.+))?$", clean)
    if match:
        return match.group(1), (match.group(2) or "").strip(), mode, ""
    return clean.lstrip("@"), "", mode, ""


def parse_options(message: str | None) -> dict[str, str]:
    """Parse newline key=value options while allowing plain text as message."""
    text = (message or "").strip()
    if not text:
        return {}
    options: dict[str, str] = {}
    plain: list[str] = []
    for line in text.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            options[key.strip().lower()] = value.strip()
        else:
            plain.append(line)
    if plain and "message" not in options and "text" not in options:
        options["message"] = "\n".join(plain).strip()
    return options


def parse_message_id(value: str | None) -> int:
    if not value or not value.strip().isdigit():
        raise ValueError("A numeric message id is required.")
    return int(value.strip())


def parse_message_ids(value: str | None) -> list[int]:
    if not value:
        raise ValueError("One or more message ids are required.")
    ids = [int(part.strip()) for part in re.split(r"[\s,]+", value) if part.strip().isdigit()]
    if not ids:
        raise ValueError("One or more numeric message ids are required.")
    return ids


def parse_forward_source(message: str | None) -> tuple[str, list[int]]:
    """Resolve the forward source chat and one or more message ids.

    Accepts:
      - @source_chat:12345 or @source_chat:101,102,103
      - a public message link https://t.me/source_chat/12345
      - a private message link https://t.me/c/1234567890/12345
    """
    source_info = (message or "").strip()
    if not source_info:
        raise ValueError("Source is required. Use @source_chat:message_id or a t.me message link.")

    link = parse_message_link(source_info)
    if link:
        return link

    parts = source_info.rsplit(":", 1)
    if len(parts) != 2 or not parts[0].strip():
        raise ValueError("Format must be @source_chat:message_id (e.g. @channel:12345) or a t.me message link.")
    source_chat = parts[0].strip()
    return source_chat, parse_message_ids(parts[1])


def parse_message_link(value: str) -> tuple[str, list[int]] | None:
    parsed = urlparse(value.strip())
    if parsed.netloc not in _TME_HOSTS:
        return None
    segments = [segment for segment in parsed.path.split("/") if segment]
    # Private channel links look like t.me/c/<internal_id>/<message_id>.
    if len(segments) >= 3 and segments[0] == "c" and segments[1].isdigit() and segments[2].isdigit():
        return f"-100{segments[1]}", [int(segments[2])]
    # Public links look like t.me/<username>/<message_id>.
    if len(segments) >= 2 and segments[1].isdigit():
        return segments[0], [int(segments[1])]
    return None


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def parse_schedule(value: str | None) -> datetime:
    clean = (value or "").strip()
    if not clean:
        raise ValueError("Schedule time is required. Use ISO time or +Nm/+Nh.")
    relative = re.match(r"^\+(\d+)([mhd])$", clean.lower())
    if relative:
        amount = int(relative.group(1))
        unit = relative.group(2)
        delta = {"m": timedelta(minutes=amount), "h": timedelta(hours=amount), "d": timedelta(days=amount)}[unit]
        return datetime.now(UTC) + delta
    try:
        parsed = datetime.fromisoformat(clean.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Schedule time must be ISO datetime or relative +15m/+2h/+1d.") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def safe_path_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())[:80] or "target"


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

    if parsed.scheme == "tg" and parsed.netloc == "resolve":
        qs = parse_qs(parsed.query)
        if qs.get("start") or qs.get("startapp") or qs.get("appname"):
            return TARGET_KIND_BOT_LINK
        return TARGET_KIND_PUBLIC_LINK if qs.get("domain") else TARGET_KIND_UNKNOWN

    if parsed.netloc in _TME_HOSTS:
        path = parsed.path.strip("/")
        if path.startswith("+") or path.startswith("joinchat/"):
            return TARGET_KIND_INVITE_LINK
        qs = parse_qs(parsed.query)
        segments = [segment for segment in path.split("/") if segment]
        # A named mini app (t.me/bot/app) has a non-numeric second segment;
        # t.me/channel/123 is a message link, so keep that as a public link.
        is_named_app = len(segments) >= 2 and not segments[1].isdigit()
        if qs.get("start") or qs.get("startapp") or is_named_app:
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
    "send_media": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "schedule_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "forward_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "edit_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "delete_messages": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "pin_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "unpin_message": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
    "download_media": {TARGET_KIND_USERNAME, TARGET_KIND_NUMERIC, TARGET_KIND_PUBLIC_LINK},
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
