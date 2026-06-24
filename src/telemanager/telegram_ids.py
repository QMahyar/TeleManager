"""Canonical Telegram chat-id marking.

Telethon's `entity.id` is the *bare* internal id: a user, a basic group, and a
channel/supergroup can all carry the same positive integer. Telegram (and
Telethon's own session cache) disambiguate them with a *marked* id:

    user            ->  id              (positive, unchanged)
    basic group     -> -id              (negated)
    channel/super   -> -(10**12 + id)   (the -100… "bot API" form)

So internal id 1424486089 for a supergroup is the marked id -1001424486089.

We store the *marked* id everywhere a chat id is persisted (the dialog cache,
and therefore every numeric target the UI emits). A bare positive id is
ambiguous and, for a username-less group/channel, fails to resolve against the
session cache — which is keyed by the marked id. Marking at the source removes
that ambiguity; `telegram_actions.resolve_input_peer` still accepts bare/raw ids
defensively for anything a user types by hand.

`mark_chat_id` is the single source of truth for the math; a test cross-checks it
against Telethon's own `utils.get_peer_id` so the two can never drift.
"""

from __future__ import annotations

from typing import Any

# Channels/supergroups are marked as -(10**12 + id). This matches Telethon's
# utils.get_peer_id / resolve_id and the bot-API "-100…" convention.
CHANNEL_MARK_BASE = 10**12

# dialog_type values that are channel-marked (supergroups are channels too).
_CHANNEL_TYPES = {"channel", "supergroup"}


def mark_chat_id(raw_id: int, *, is_channel: bool, is_basic_group: bool) -> int:
    """Return the marked id for a chat from its bare id and kind.

    Idempotent: an already-marked (negative) id is returned unchanged, so this is
    safe to run over records that may already be normalized. Users/bots keep their
    positive id.
    """
    if raw_id < 0:
        # Already marked (or a hand-typed -100…/-id form) — leave it alone.
        return raw_id
    if is_channel:
        return -(CHANNEL_MARK_BASE + raw_id)
    if is_basic_group:
        return -raw_id
    return raw_id


def _record_is_channel(record: dict[str, Any], dialog_type: str | None) -> bool:
    return dialog_type in _CHANNEL_TYPES or bool(record.get("is_channel"))


def _record_is_basic_group(
    record: dict[str, Any], dialog_type: str | None, is_channel: bool
) -> bool:
    # Supergroups set is_group too, so a basic group is "a group that isn't a
    # channel". dialog_type is the primary signal; is_group is the fallback for
    # very old records.
    if is_channel:
        return False
    return dialog_type == "group" or bool(record.get("is_group"))


def marked_dialog_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a cached-dialog dict with its `id` marked, migrating legacy caches.

    Older caches stored the bare `entity.id`; this re-marks them on read using the
    type metadata persisted alongside (`dialog_type`/`is_channel`/`is_group`).
    Returns the same object when nothing changes (already marked, or a
    user/bot/unknown that needs no marking) so callers can cheaply detect a no-op.
    """
    raw = record.get("id")
    if not isinstance(raw, int) or isinstance(raw, bool) or raw < 0:
        return record
    dialog_type = record.get("dialog_type")
    is_channel = _record_is_channel(record, dialog_type)
    is_basic_group = _record_is_basic_group(record, dialog_type, is_channel)
    marked = mark_chat_id(raw, is_channel=is_channel, is_basic_group=is_basic_group)
    if marked == raw:
        return record
    return {**record, "id": marked}
