# pyright: reportMissingImports=false
"""Numeric target resolution.

Regression cover for the bug where a raw channel/supergroup id (e.g. 1424486089)
or a negative id (-1424486089) returned 400/PEER_ID_INVALID because Telethon never
coerces a numeric *string* to an int, so its cache lookup never ran.

FakeClient mirrors Telethon's documented int contract, including the sharp edge that
makes candidate *ordering* matter: a positive id is validated against every peer
marking, a channel-marked negative id is matched exactly, but a *chat-range* negative
id is turned into an unvalidated InputPeerChat without ever touching the cache. That
last case is why the resolver must try the positive form first — otherwise a negated
channel id silently resolves to the wrong peer.
"""
from __future__ import annotations

import asyncio
from typing import Any, cast

import pytest

from telemanager import telegram_actions as actions

# The session knows the supergroup only under its marked id, exactly like the real
# bug: the dialog cache/UI exposes the raw 1424486089.
KNOWN_MARKED_CHANNEL = -1001424486089
CHANNEL_RANGE = -(10**12)


class FakeClient:
    """Mimics telethon's TelegramClient.get_input_entity int/str contract."""

    def __init__(self, known: set[int]) -> None:
        self.known = known

    async def get_input_entity(self, value: Any) -> Any:
        if isinstance(value, str):
            # Non-numeric strings resolve as usernames/links over the network.
            return f"username:{value}"
        if isinstance(value, int):
            if value >= 0:
                # Positive ids are expanded across user/chat/channel markings and
                # validated against the cache.
                for marked in (value, -value, -(10**12 + value)):
                    if marked in self.known:
                        return f"peer:{marked}"
                raise ValueError(f"no entity for positive id {value}")
            if value <= CHANNEL_RANGE:
                # Channel-marked id: matched exactly against the cache.
                if value in self.known:
                    return f"peer:{value}"
                raise ValueError(f"no exact channel for {value}")
            # Chat-range negative id: Telethon hands back an InputPeerChat WITHOUT
            # consulting the cache. This is the trap the resolver must avoid leaning on.
            return f"unvalidated-chat:{-value}"
        raise TypeError(type(value))


def _resolve(target: str, known: set[int]) -> Any:
    client = cast(Any, FakeClient(known))
    return asyncio.run(actions.resolve_input_peer(client, target))


def test_raw_positive_supergroup_id_resolves() -> None:
    assert _resolve("1424486089", {KNOWN_MARKED_CHANNEL}) == f"peer:{KNOWN_MARKED_CHANNEL}"


def test_negative_bare_id_resolves_to_the_real_channel_not_a_bogus_chat() -> None:
    # -1424486089 is in the chat range; trying it first would yield an unvalidated chat.
    # The resolver leads with the positive form, so it lands on the real channel.
    assert _resolve("-1424486089", {KNOWN_MARKED_CHANNEL}) == f"peer:{KNOWN_MARKED_CHANNEL}"


def test_marked_channel_id_resolves() -> None:
    assert _resolve("-1001424486089", {KNOWN_MARKED_CHANNEL}) == f"peer:{KNOWN_MARKED_CHANNEL}"


def test_username_passes_through_untouched() -> None:
    assert _resolve("@somechannel", set()) == "username:@somechannel"


def test_tme_link_is_normalized_then_passed_through() -> None:
    assert _resolve("https://t.me/somechannel", set()) == "username:somechannel"


def test_phone_number_is_not_treated_as_numeric_id() -> None:
    # A leading + must not be parsed as an integer; it stays a string for Telethon.
    assert _resolve("+15551234567", set()) == "username:+15551234567"


def test_unknown_numeric_id_raises_actionable_error() -> None:
    with pytest.raises(ValueError, match="Could not resolve the chat for ID 999"):
        _resolve("999", {KNOWN_MARKED_CHANNEL})
