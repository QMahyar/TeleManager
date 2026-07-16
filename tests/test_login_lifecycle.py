"""Mocked tests for the login lifecycle and account validation paths.

No Telegram network calls -- every test monkeypatches ``_new_client`` with a
:class:`FakeLoginClient` and stubs ``_connect_client`` so all code paths are
pure in-process.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import add_account
from telethon.errors import (
    PasswordHashInvalidError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)

PHONE = "+15551234567"


# ---------------------------------------------------------------------------
# Fake Telegram client
# ---------------------------------------------------------------------------


class FakeLoginClient:
    """Stand-in for :class:`telethon.TelegramClient` that exercises the
    login / validate code paths without any network I/O.

    Configure behaviour via instance attributes before each call:
      * ``_authorized`` -- what ``is_user_authorized()`` returns.
      * ``_sign_in_side_effect`` -- exception raised by ``sign_in()``
        (consumed after the first raise, then reverts to success).
    """

    def __init__(self) -> None:
        self._connected = False
        self._authorized = False
        self._sign_in_side_effect: Exception | None = None
        self._me = SimpleNamespace(
            id=12345,
            username="testuser",
            first_name="Test",
            last_name="User",
        )

    # -- TelegramClient interface ------------------------------------------

    async def connect(self) -> None:
        self._connected = True

    async def disconnect(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    async def is_user_authorized(self) -> bool:
        return self._authorized

    async def send_code_request(self, phone: str) -> Any:
        return SimpleNamespace(phone_code_hash="fake-phone-code-hash")

    async def sign_in(
        self,
        phone: str | None = None,
        code: str | None = None,
        phone_code_hash: str | None = None,
        password: str | None = None,
    ) -> None:
        if self._sign_in_side_effect is not None:
            exc = self._sign_in_side_effect
            self._sign_in_side_effect = None  # consume after first raise
            raise exc
        self._authorized = True

    async def get_me(self) -> Any:
        return self._me


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _manager(app_context: dict):
    return app_context["main"].manager


def _seed_account(app_context: dict, phone: str = PHONE) -> Any:
    """Create an account whose *phone* matches the one we pass to
    ``start_login`` so ``_find_or_create_account`` reuses the existing id."""
    account = add_account(app_context, "acc-login", "Login Test", authorized=False)
    account.phone = phone
    return account


def _wire_fake(
    app_context: dict,
    monkeypatch: pytest.MonkeyPatch,
    fake: FakeLoginClient,
) -> None:
    """Wire a :class:`FakeLoginClient` into the manager for login / validate
    operations."""
    manager = _manager(app_context)
    monkeypatch.setattr(manager, "get_api_credentials", lambda: (1, "fake-hash"))
    monkeypatch.setattr(manager, "_new_client", lambda *a, **k: fake)

    async def _noop_connect(_client: Any) -> None:
        pass

    monkeypatch.setattr(manager, "_connect_client", _noop_connect)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_already_authorized_on_start_login(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 1 -- Client reports already authorized on ``start_login``:
    account is marked authorized with no pending login entry."""
    fake = FakeLoginClient()
    fake._authorized = True
    _seed_account(app_context)
    _wire_fake(app_context, monkeypatch, fake)

    account = asyncio.run(_manager(app_context).start_login(phone=PHONE))

    assert account.authorized is True
    assert account.status == "stopped"
    assert account.last_error is None
    assert account.id not in _manager(app_context).pending_logins


def test_code_path_start_to_confirm(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 2 -- ``start_login`` -> login_pending; ``confirm_code`` ->
    authorized; pending cleared; exclusive lock released."""
    fake = FakeLoginClient()
    fake._authorized = False
    _seed_account(app_context)
    _wire_fake(app_context, monkeypatch, fake)
    manager = _manager(app_context)

    # Step 1: start_login sends code request
    account = asyncio.run(manager.start_login(phone=PHONE))
    assert account.status == "login_pending"
    assert account.id in manager.pending_logins

    # Step 2: confirm_code with valid code completes login
    account = asyncio.run(manager.confirm_code(account.id, "12345"))
    assert account.authorized is True
    assert account.status == "stopped"
    assert account.last_error is None
    assert account.id not in manager.pending_logins


def test_2fa_password_pending_then_confirm(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 3 -- ``confirm_code`` raises ``SessionPasswordNeededError`` ->
    password_pending; bad password fails and stays pending; good password
    completes login."""
    fake = FakeLoginClient()
    fake._authorized = False
    _seed_account(app_context)
    _wire_fake(app_context, monkeypatch, fake)
    manager = _manager(app_context)

    # Start login (sends code)
    account = asyncio.run(manager.start_login(phone=PHONE))
    assert account.status == "login_pending"

    # Confirm code triggers 2FA
    fake._sign_in_side_effect = SessionPasswordNeededError(request=None)
    account = asyncio.run(manager.confirm_code(account.id, "12345"))
    assert account.status == "password_pending"
    assert account.authorized is False

    # Bad password -> still password_pending
    fake._sign_in_side_effect = PasswordHashInvalidError(request=None)
    with pytest.raises(ValueError, match="Incorrect 2FA"):
        asyncio.run(manager.confirm_password(account.id, "wrong-password"))
    assert account.status == "password_pending"
    assert account.id in manager.pending_logins

    # Good password -> authorized
    account = asyncio.run(manager.confirm_password(account.id, "correct-password"))
    assert account.authorized is True
    assert account.status == "stopped"
    assert account.id not in manager.pending_logins


def test_invalid_code_still_login_pending(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 4 -- ``confirm_code`` with invalid code raises
    ``PhoneCodeInvalidError``; account stays login_pending."""
    fake = FakeLoginClient()
    fake._authorized = False
    _seed_account(app_context)
    _wire_fake(app_context, monkeypatch, fake)
    manager = _manager(app_context)

    account = asyncio.run(manager.start_login(phone=PHONE))
    assert account.status == "login_pending"

    fake._sign_in_side_effect = PhoneCodeInvalidError(request=None)
    with pytest.raises(ValueError):
        asyncio.run(manager.confirm_code(account.id, "bad-code"))

    assert account.status == "login_pending"
    assert account.id in manager.pending_logins


def test_validate_account_authorized(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 5 -- ``validate_account`` on an authorized session sets
    ``last_validated_at`` and keeps ``authorized`` True."""
    fake = FakeLoginClient()
    fake._authorized = True
    account = _seed_account(app_context)
    account.authorized = True
    account.status = "stopped"
    _wire_fake(app_context, monkeypatch, fake)

    result = asyncio.run(_manager(app_context).validate_account(account.id))

    assert result.authorized is True
    assert result.last_validated_at is not None
    assert result.last_error is None


def test_validate_account_unauthorized(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 6 -- ``validate_account`` on a stale session marks
    ``authorized`` False and sets ``last_error``."""
    fake = FakeLoginClient()
    fake._authorized = False
    account = _seed_account(app_context)
    account.authorized = True  # was authorized, now stale
    _wire_fake(app_context, monkeypatch, fake)

    result = asyncio.run(_manager(app_context).validate_account(account.id))

    assert result.authorized is False
    assert result.last_error is not None
    assert "not authorized" in result.last_error.lower()


def test_start_login_busy_account_raises_account_busy_error(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Case 7 -- When a session_guard holds the account, ``start_login``
    raises ``AccountBusyError`` via ``try_begin_exclusive``."""
    from telemanager.accounts import AccountBusyError

    fake = FakeLoginClient()
    account = _seed_account(app_context)
    _wire_fake(app_context, monkeypatch, fake)
    manager = _manager(app_context)

    async def go() -> str:
        async with manager.session_guard([account.id]):
            try:
                await manager.start_login(phone=PHONE)
                return "acquired"
            except AccountBusyError:
                return "busy"

    assert asyncio.run(go()) == "busy"
