"""Characterization tests for dialogs fetch, fetch_messages, search_messages.

Uses fake clients (no network). Pattern from test_dialog_photos.py.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from conftest import add_account
from telethon.tl.types import Channel, Chat, ChatPhotoEmpty, User

from telemanager.dialogs_service import (
    CachedDialog,
    classify_dialog,
    fetch_dialogs,
    fetch_messages,
    message_to_dict,
    search_messages,
    search_result_to_dict,
)
from telemanager.telegram_ids import mark_chat_id


# ---------------------------------------------------------------------------
# Fake helpers
# ---------------------------------------------------------------------------

class _FakeDialog:
    def __init__(self, entity, name: str = "", unread: int = 0, pinned: bool = False):
        self.entity = entity
        self.name = name
        self.unread_count = unread
        self.pinned = pinned
        self.archived = False
        self.dialog = SimpleNamespace(
            notify_settings=SimpleNamespace(mute_until=None),
        )


class _FakeMessage:
    """A bare message object matching Telethon's Message duck type."""
    def __init__(self, mid: int, text: str = "", sender=None, out: bool = False, media=None):
        self.id = mid
        self.date = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
        self.message = text
        self.sender = sender
        self.sender_id = getattr(sender, "id", None) if sender else None
        self.out = out
        self.media = media


def _make_user(uid: int, username: str | None = None, bot: bool = False) -> User:
    return User(id=uid, access_hash=0, username=username, bot=bot)


def _make_channel(cid: int, megagroup: bool = False, broadcast: bool = True,
                  username: str | None = None) -> Channel:
    return Channel(
        id=cid, access_hash=0, title="", photo=ChatPhotoEmpty(),
        date=datetime(2026, 1, 1, tzinfo=UTC),
        broadcast=broadcast, megagroup=megagroup, username=username,
    )


# ---------------------------------------------------------------------------
# Tests: classify_dialog
# ---------------------------------------------------------------------------

def test_classify_dialog_user_personal():
    entity = _make_user(uid=100)
    dialog = _FakeDialog(entity, name="Alice")
    result = classify_dialog(dialog)
    assert isinstance(result, CachedDialog)
    assert result.id == 100
    assert result.dialog_type == "personal"
    assert result.is_user is True
    assert result.is_channel is False
    assert result.title == "Alice"


def test_classify_dialog_channel():
    entity = _make_channel(cid=1424486089, broadcast=True, username="news")
    dialog = _FakeDialog(entity, name="News Channel")
    result = classify_dialog(dialog)
    expected_id = mark_chat_id(1424486089, is_channel=True, is_basic_group=False)
    assert result.id == expected_id
    assert result.dialog_type == "channel"
    assert result.is_channel is True
    assert result.username == "news"


def test_classify_dialog_supergroup():
    entity = _make_channel(cid=1424486089, megagroup=True, broadcast=False)
    dialog = _FakeDialog(entity, name="Super Group")
    result = classify_dialog(dialog)
    assert result.dialog_type == "supergroup"
    assert result.is_group is True
    assert result.is_megagroup is True


def test_classify_dialog_bot():
    entity = _make_user(uid=200, username="mybot", bot=True)
    dialog = _FakeDialog(entity, name="My Bot")
    result = classify_dialog(dialog)
    assert result.dialog_type == "bot"
    assert result.is_bot is True


# ---------------------------------------------------------------------------
# Tests: fetch_dialogs (fake iter_dialogs -> cache + dialog_count)
# ---------------------------------------------------------------------------

def test_fetch_dialogs_writes_cache_and_updates_count(
    app_context: dict, monkeypatch: pytest.MonkeyPatch,
):
    """Fake iter_dialogs yields a personal user and a channel -> cache file
    written under data/dialogs; account dialog_count updated."""
    account = add_account(app_context, "acc-msg", "MsgAccount")
    manager = app_context["main"].manager
    config = app_context["config"]

    user_entity = _make_user(uid=100, username="alice")
    channel_entity = _make_channel(cid=1424486089, broadcast=True)
    dialogs = [
        _FakeDialog(user_entity, name="Alice", unread=3),
        _FakeDialog(channel_entity, name="News"),
    ]

    class _FakeClient:
        async def iter_dialogs(self, limit=0):
            for d in dialogs:
                yield d
        def disconnect(self):
            return None

    fake = _FakeClient()

    @asynccontextmanager
    async def _ctx(_account_id):
        yield fake

    monkeypatch.setattr(manager, "temp_client", _ctx)
    config.write_json(config.APP_SETTINGS_FILE, {"show_dialog_photos": False})

    payload = asyncio.run(fetch_dialogs(manager, account.id, limit=10))

    assert len(payload["dialogs"]) == 2
    types = {d["dialog_type"] for d in payload["dialogs"]}
    assert types == {"personal", "channel"}
    # Service updates fleet metadata after classifying the fake iter.
    assert manager.accounts[account.id].dialog_count == 2
    assert manager.accounts[account.id].last_dialog_fetch_at is not None


# ---------------------------------------------------------------------------
# Tests: message_to_dict / search_result_to_dict
# ---------------------------------------------------------------------------

def test_message_to_dict_basic():
    sender = SimpleNamespace(id=10, username="bob", first_name="Bob", last_name="Smith")
    msg = _FakeMessage(mid=42, text="hello", sender=sender, out=False)
    result = message_to_dict(msg)
    assert result["id"] == 42
    assert result["text"] == "hello"
    assert result["sender_id"] == 10
    assert result["sender_name"] == "bob"
    assert result["out"] is False
    assert result["has_media"] is False


def test_message_to_dict_with_media():
    msg = _FakeMessage(mid=1, text="", media=SimpleNamespace())
    result = message_to_dict(msg)
    assert result["has_media"] is True
    assert result["text"] == ""


def test_search_result_to_dict_includes_chat_info():
    chat = SimpleNamespace(title="Ops Room", username="ops", first_name=None, last_name=None)
    msg = _FakeMessage(mid=7, text="update")
    msg.chat = chat
    msg.chat_id = -100123
    result = search_result_to_dict(msg)
    assert result["chat_title"] == "Ops Room"
    assert result["chat_id"] == -100123
    assert result["chat_username"] == "ops"


# ---------------------------------------------------------------------------
# Tests: fetch_messages (mocked client + get_input_peer)
# ---------------------------------------------------------------------------

def test_fetch_messages_returns_expected_payload(
    app_context: dict, monkeypatch: pytest.MonkeyPatch,
):
    """fetch_messages with a fake client returns serialized messages."""
    account = add_account(app_context, "acc-msg", "MsgAccount")
    manager = app_context["main"].manager

    fake_msgs = [
        _FakeMessage(mid=10, text="first message"),
        _FakeMessage(mid=11, text="second message"),
    ]

    class _FakeClient:
        async def get_messages(self, peer, limit=50):
            return fake_msgs
        async def get_input_entity(self, target):
            return SimpleNamespace(peer_id=target)
        def disconnect(self):
            return None

    fake = _FakeClient()

    @asynccontextmanager
    async def _ctx(_account_id):
        yield fake

    monkeypatch.setattr(manager, "temp_client", _ctx)

    payload = asyncio.run(fetch_messages(manager, account.id, target="some_chat", limit=50))

    assert payload["account_id"] == account.id
    assert payload["account_label"] == "MsgAccount"
    assert payload["target"] == "some_chat"
    assert len(payload["messages"]) == 2
    assert payload["messages"][0]["id"] == 10
    assert payload["messages"][0]["text"] == "first message"
    assert payload["messages"][1]["id"] == 11


def test_fetch_messages_empty_response(
    app_context: dict, monkeypatch: pytest.MonkeyPatch,
):
    """fetch_messages handles None / empty result gracefully."""
    account = add_account(app_context, "acc-msg", "MsgAccount")
    manager = app_context["main"].manager

    class _FakeClient:
        async def get_messages(self, peer, limit=50):
            return None
        async def get_input_entity(self, target):
            return SimpleNamespace(peer_id=target)
        def disconnect(self):
            return None

    fake = _FakeClient()

    @asynccontextmanager
    async def _ctx(_account_id):
        yield fake

    monkeypatch.setattr(manager, "temp_client", _ctx)

    payload = asyncio.run(fetch_messages(manager, account.id, target="x", limit=50))
    assert payload["messages"] == []


# ---------------------------------------------------------------------------
# Tests: search_messages (mocked client)
# ---------------------------------------------------------------------------

def test_search_messages_returns_expected_payload(
    app_context: dict, monkeypatch: pytest.MonkeyPatch,
):
    """search_messages with a fake client returns search results with chat labels."""
    account = add_account(app_context, "acc-msg", "MsgAccount")
    manager = app_context["main"].manager

    chat = SimpleNamespace(title="General", username=None, first_name=None, last_name=None)

    class _FakeClient:
        async def iter_messages(self, entity, search=None, limit=50):
            msg = _FakeMessage(mid=99, text="found it")
            msg.chat = chat
            msg.chat_id = -100456
            yield msg
        def disconnect(self):
            return None

    fake = _FakeClient()

    @asynccontextmanager
    async def _ctx(_account_id):
        yield fake

    monkeypatch.setattr(manager, "temp_client", _ctx)

    payload = asyncio.run(search_messages(manager, account.id, query="found", limit=50))

    assert payload["account_id"] == account.id
    assert payload["query"] == "found"
    assert len(payload["messages"]) == 1
    result = payload["messages"][0]
    assert result["text"] == "found it"
    assert result["chat_title"] == "General"
    assert result["chat_id"] == -100456


def test_search_messages_rejects_blank_query(app_context: dict):
    """Blank query raises ValueError before any client is opened."""
    account = add_account(app_context, "acc-msg", "MsgAccount")
    manager = app_context["main"].manager

    with pytest.raises(ValueError, match="Search query is required"):
        asyncio.run(search_messages(manager, account.id, query="   ", limit=10))
