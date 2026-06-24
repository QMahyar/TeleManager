# pyright: reportMissingImports=false
"""Telegram chat-id marking and legacy-cache migration.

Covers the bug where the dialog cache stored bare positive ids, so a
username-less group/channel was targeted by an ambiguous id that the session
cache (keyed by the marked id) could never resolve.
"""
from __future__ import annotations

from telethon import utils as telethon_utils
from telethon.tl.types import PeerChannel, PeerChat, PeerUser

from telemanager.telegram_ids import mark_chat_id, marked_dialog_record

KNOWN_RAW = 1424486089
KNOWN_MARKED = -1001424486089


# --- mark_chat_id -----------------------------------------------------------


def test_user_id_stays_positive() -> None:
    assert mark_chat_id(123456789, is_channel=False, is_basic_group=False) == 123456789


def test_basic_group_is_negated() -> None:
    assert mark_chat_id(12345, is_channel=False, is_basic_group=True) == -12345


def test_channel_gets_minus_100_marker() -> None:
    assert mark_chat_id(KNOWN_RAW, is_channel=True, is_basic_group=False) == KNOWN_MARKED


def test_channel_marking_wins_over_group_flag() -> None:
    # A supergroup is both a channel and "a group"; the channel marker must win,
    # never the basic-group negation.
    assert mark_chat_id(KNOWN_RAW, is_channel=True, is_basic_group=True) == KNOWN_MARKED


def test_already_marked_ids_are_idempotent() -> None:
    assert mark_chat_id(KNOWN_MARKED, is_channel=True, is_basic_group=False) == KNOWN_MARKED
    assert mark_chat_id(-12345, is_channel=False, is_basic_group=True) == -12345


def test_mark_chat_id_matches_telethon_get_peer_id() -> None:
    # Lock our arithmetic to Telethon's canonical marking so the two can't drift.
    assert mark_chat_id(123, is_channel=False, is_basic_group=False) == telethon_utils.get_peer_id(
        PeerUser(123)
    )
    assert mark_chat_id(456, is_channel=False, is_basic_group=True) == telethon_utils.get_peer_id(
        PeerChat(456)
    )
    assert mark_chat_id(KNOWN_RAW, is_channel=True, is_basic_group=False) == telethon_utils.get_peer_id(
        PeerChannel(KNOWN_RAW)
    )


# --- marked_dialog_record (read-time legacy migration) ----------------------


def test_migrate_legacy_supergroup_record() -> None:
    record = {"id": KNOWN_RAW, "dialog_type": "supergroup", "is_channel": True, "is_group": True}
    assert marked_dialog_record(record)["id"] == KNOWN_MARKED


def test_migrate_legacy_basic_group_record() -> None:
    record = {"id": 555, "dialog_type": "group", "is_group": True, "is_channel": False}
    assert marked_dialog_record(record)["id"] == -555


def test_migrate_leaves_user_record_positive() -> None:
    record = {"id": 777, "dialog_type": "personal"}
    assert marked_dialog_record(record)["id"] == 777


def test_migrate_uses_dialog_type_when_flags_absent() -> None:
    # Very old caches may lack the is_channel/is_group booleans; dialog_type alone
    # is enough to mark correctly.
    record = {"id": KNOWN_RAW, "dialog_type": "channel"}
    assert marked_dialog_record(record)["id"] == KNOWN_MARKED


def test_migrate_is_a_noop_on_marked_record() -> None:
    record = {"id": KNOWN_MARKED, "dialog_type": "channel", "is_channel": True}
    assert marked_dialog_record(record) is record


def test_migrate_ignores_records_without_type_info() -> None:
    # A bare positive id with no type metadata can't be safely re-marked.
    record = {"id": 1}
    assert marked_dialog_record(record) is record


def test_migrate_does_not_mutate_input_record() -> None:
    record = {"id": KNOWN_RAW, "dialog_type": "channel"}
    marked_dialog_record(record)
    assert record["id"] == KNOWN_RAW  # original left untouched; a copy is returned
