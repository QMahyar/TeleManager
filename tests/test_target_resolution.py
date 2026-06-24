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
from telethon.errors import FloodWaitError

from telemanager import telegram_actions as actions

# The session knows the supergroup only under its marked id. The cache now stores that
# marked id, but a raw 1424486089 still arrives when pasted by hand or replayed from an
# old queued step, so the resolver must keep coercing it to the right peer.
KNOWN_MARKED_CHANNEL = -1001424486089
CHANNEL_RANGE = -(10**12)


class FakeClient:
    """Mimics telethon's TelegramClient.get_input_entity int/str contract.

    `discoverable` models chats the account is a member of but hasn't cached yet:
    they only become resolvable after get_dialogs() primes the session cache,
    exactly like a fresh account in a queued multi-account run. `dialogs_error`
    lets a test make priming fail (e.g. a flood wait).
    """

    def __init__(
        self,
        known: set[int],
        discoverable: set[int] | None = None,
        dialogs_error: Exception | None = None,
    ) -> None:
        self.known = set(known)
        self.discoverable = set(discoverable or ())
        self.dialogs_error = dialogs_error
        self.get_dialogs_calls = 0

    async def get_dialogs(self, limit: int | None = None) -> list[Any]:
        self.get_dialogs_calls += 1
        if self.dialogs_error is not None:
            raise self.dialogs_error
        # Priming reveals the account's own chats (with their access hashes).
        self.known |= self.discoverable
        return []

    async def get_entity(self, value: Any) -> Any:
        # The full-entity path shares the same int/str resolution contract.
        return await self.get_input_entity(value)

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


# --- Multi-account run: a username-less chat picked on one account must still
# resolve on the other accounts that share it. Regression for "the action only
# ran on the account I picked the chat from". ---


def test_numeric_id_resolves_after_priming_when_member() -> None:
    # The account is a member but hadn't cached the chat (it never fetched its
    # dialogs). Priming reveals it, so the retry resolves instead of failing.
    client = cast(Any, FakeClient(set(), discoverable={KNOWN_MARKED_CHANNEL}))
    result = asyncio.run(actions.resolve_input_peer(client, "1424486089"))
    assert result == f"peer:{KNOWN_MARKED_CHANNEL}"
    assert client.get_dialogs_calls == 1


def test_numeric_id_not_a_member_raises_after_priming() -> None:
    # Priming reveals nothing — the account isn't in the chat — so it fails with a
    # clearer reason, having tried to prime exactly once.
    client = cast(Any, FakeClient(set(), discoverable=set()))
    with pytest.raises(ValueError, match="may not be a member"):
        asyncio.run(actions.resolve_input_peer(client, "1424486089"))
    assert client.get_dialogs_calls == 1


def test_dialog_priming_happens_at_most_once_per_client() -> None:
    # Several unresolvable numeric targets on the same client must not re-fetch
    # dialogs each time; priming is once per client for the whole run.
    client = cast(Any, FakeClient(set(), discoverable=set()))
    for target in ("1424486089", "777000"):
        with pytest.raises(ValueError):
            asyncio.run(actions.resolve_input_peer(client, target))
    assert client.get_dialogs_calls == 1


def test_flood_wait_during_priming_propagates() -> None:
    # A rate limit while priming must surface so the queue backs off, rather than
    # being masked as "chat not found".
    client = cast(Any, FakeClient(set(), dialogs_error=FloodWaitError(None, capture=5)))
    with pytest.raises(FloodWaitError):
        asyncio.run(actions.resolve_input_peer(client, "1424486089"))
    assert client.get_dialogs_calls == 1


def test_full_entity_resolution_also_primes() -> None:
    # The full-entity path (used by reads) shares the same prime-and-retry helper.
    client = cast(Any, FakeClient(set(), discoverable={KNOWN_MARKED_CHANNEL}))
    result = asyncio.run(actions.resolve_full_entity(client, "1424486089"))
    assert result == f"peer:{KNOWN_MARKED_CHANNEL}"
    assert client.get_dialogs_calls == 1
