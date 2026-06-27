# pyright: reportMissingImports=false
"""Phase 1 backend hardening: explicit account serialization + send_media guard."""
from __future__ import annotations

import asyncio
import importlib

import pytest


def test_to_public_dict_does_not_leak_unlisted_attributes(app_context: dict) -> None:
    AccountRecord = app_context["accounts"].AccountRecord
    account = AccountRecord(id="a", label="L", phone="+15555550100", session_name="s")
    # Simulate a future internal field tacked onto the record.
    account.internal_token = "TOPSECRET"  # type: ignore[attr-defined]

    public = account.to_public_dict()

    assert "internal_token" not in public  # enumerated serializer, not __dict__
    assert public["phone"] == "+15555550100"  # operator-owned, intentionally present


def test_send_media_rejects_missing_file(app_context: dict) -> None:
    actions = importlib.import_module("telemanager.telegram_actions")
    # The file-existence check runs before any client use, so a None client is fine.
    with pytest.raises(ValueError, match="not found"):
        asyncio.run(actions.send_media(None, "@target", "file=/no/such/file.png"))
