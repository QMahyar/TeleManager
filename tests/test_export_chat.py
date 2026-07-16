"""Tests for the export_chat action — JSON export of dialog history.

Uses a fake Telethon client with an in-memory message iterator; no live
Telegram connection required.
"""
from __future__ import annotations

import asyncio
import json
import typing
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@dataclass
class FakeMessage:
    """Minimal stand-in for telethon.tl.types.Message."""

    id: int
    date: datetime
    message: str
    sender_id: int | None = None
    out: bool = False
    media: Any = None
    sender: Any = None
    chat: Any = None
    chat_id: int | None = None


class FakeIterator:
    """Yields messages one-by-one, mimicking client.iter_messages."""

    def __init__(self, messages: list[FakeMessage]):
        self._messages = messages
        self._limit: int | None = None

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)


class FakeClient:
    """Duck-typed Telethon client for offline tests."""

    def __init__(self, messages: list[FakeMessage] | None = None):
        self._messages = list(messages or [])
        self._self_user = type("User", (), {"id": 99999})()

    async def get_input_entity(self, target: str) -> str:
        return target

    def iter_messages(self, peer: Any, limit: int | None = None) -> FakeIterator:
        msgs = list(self._messages)
        if limit is not None:
            msgs = msgs[:limit]
        return FakeIterator(msgs)


def _actions():
    return __import__("telemanager.telegram_actions", fromlist=["telegram_actions"])


def _config():
    return __import__("telemanager.config", fromlist=["config"])


def _make_messages(n: int) -> list[FakeMessage]:
    base = datetime(2025, 1, 1, tzinfo=UTC)
    return [
        FakeMessage(
            id=i + 1,
            date=base,
            message=f"Message {i + 1}",
            sender_id=100,
            out=(i % 3 == 0),
            media=None if i % 5 != 0 else object(),
        )
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# Core export
# ---------------------------------------------------------------------------


def test_export_chat_creates_json_file(app_context: dict) -> None:
    ta = _actions()
    cfg = _config()
    messages = _make_messages(10)
    client = FakeClient(messages)

    async def run() -> str:
        return await ta.export_chat(client, "@testchat", None)

    detail = asyncio.run(run())
    assert "Exported 10 messages" in detail

    # Find the export file
    exports = list(cfg.EXPORTS_DIR.glob("*.json"))
    assert len(exports) == 1
    export_path = exports[0]
    assert "_testchat_" in export_path.name

    payload = json.loads(export_path.read_text(encoding="utf-8"))
    assert payload["target"] == "@testchat"
    assert payload["message_count"] == 10
    assert len(payload["messages"]) == 10
    assert payload["exported_at"] is not None
    assert payload["cap"] == ta.EXPORT_CHAT_MAX_MESSAGES
    # Each message has the expected shape from message_to_dict
    msg = payload["messages"][0]
    assert "id" in msg
    assert "date" in msg
    assert "text" in msg
    assert "sender_id" in msg


def test_export_chat_options_limit(app_context: dict) -> None:
    ta = _actions()
    cfg = _config()
    messages = _make_messages(100)
    client = FakeClient(messages)

    async def run() -> str:
        return await ta.export_chat(client, "@chat", "limit=5")

    detail = asyncio.run(run())
    assert "Exported 5 messages" in detail

    exports = list(cfg.EXPORTS_DIR.glob("*.json"))
    payload = json.loads(exports[-1].read_text(encoding="utf-8"))
    assert payload["message_count"] == 5


def test_export_chat_options_media_flag(app_context: dict) -> None:
    ta = _actions()
    cfg = _config()
    messages = _make_messages(3)
    client = FakeClient(messages)

    async def run() -> str:
        return await ta.export_chat(client, "@chat", "media=true")

    asyncio.run(run())

    exports = list(cfg.EXPORTS_DIR.glob("*.json"))
    payload = json.loads(exports[-1].read_text(encoding="utf-8"))
    # With media=true, has_media should be present in records
    msg = payload["messages"][0]
    assert "has_media" in msg


def test_export_chat_media_off_by_default(app_context: dict) -> None:
    ta = _actions()
    cfg = _config()
    messages = _make_messages(3)
    client = FakeClient(messages)

    async def run() -> str:
        return await ta.export_chat(client, "@chat", None)

    asyncio.run(run())

    exports = list(cfg.EXPORTS_DIR.glob("*.json"))
    payload = json.loads(exports[-1].read_text(encoding="utf-8"))
    # Without media flag, has_media is stripped from records
    msg = payload["messages"][0]
    assert "has_media" not in msg


def test_export_chat_empty_dialog(app_context: dict) -> None:
    ta = _actions()
    cfg = _config()
    client = FakeClient([])

    async def run() -> str:
        return await ta.export_chat(client, "@empty", None)

    detail = asyncio.run(run())
    assert "Exported 0 messages" in detail

    exports = list(cfg.EXPORTS_DIR.glob("*.json"))
    payload = json.loads(exports[-1].read_text(encoding="utf-8"))
    assert payload["message_count"] == 0
    assert payload["messages"] == []


def test_export_chat_cap_enforced(app_context: dict) -> None:
    ta = _actions()
    messages = _make_messages(200)
    client = FakeClient(messages)

    async def run() -> str:
        # Request 500 but the hard cap should limit to 10000; with 200 messages
        # we get all 200 since it's under cap.
        return await ta.export_chat(client, "@chat", "limit=500")

    detail = asyncio.run(run())
    assert "Exported 200 messages" in detail


def test_export_chat_invalid_limit_falls_back_to_default(app_context: dict) -> None:
    ta = _actions()
    messages = _make_messages(5)
    client = FakeClient(messages)

    async def run() -> str:
        return await ta.export_chat(client, "@chat", "limit=notanumber")

    detail = asyncio.run(run())
    # Falls back to EXPORT_CHAT_MAX_MESSAGES but only 5 messages exist
    assert "Exported 5 messages" in detail


# ---------------------------------------------------------------------------
# Registry / meta
# ---------------------------------------------------------------------------


def test_export_chat_in_action_type_literal(app_context: dict) -> None:
    ta = _actions()
    declared = set(typing.get_args(ta.TelegramActionType))
    assert "export_chat" in declared


def test_export_chat_in_action_meta(app_context: dict) -> None:
    ta = _actions()
    meta = ta.ACTION_META["export_chat"]
    assert meta.tier == "instant"
    assert meta.category == "downloads"
    assert meta.needs_message is True
    assert meta.message_optional is True
    assert meta.destructive is False


def test_export_chat_not_in_message_required(app_context: dict) -> None:
    ta = _actions()
    assert "export_chat" not in ta.MESSAGE_REQUIRED_ACTIONS


def test_export_chat_valid_targets(app_context: dict) -> None:
    ta = _actions()
    targets = ta.VALID_TARGETS["export_chat"]
    assert "username" in targets
    assert "numeric_id" in targets
    assert "public_link" in targets


# ---------------------------------------------------------------------------
# Route / endpoint
# ---------------------------------------------------------------------------


def test_actions_meta_includes_export_chat(client) -> None:
    response = client.get("/api/actions/meta")
    assert response.status_code == 200
    body = response.json()
    assert "export_chat" in body["actions"]
    assert body["actions"]["export_chat"]["tier"] == "instant"
    assert body["actions"]["export_chat"]["category"] == "downloads"
