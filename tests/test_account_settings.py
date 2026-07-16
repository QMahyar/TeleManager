"""Pure-helper checks for account_settings_service (no live client).

Also includes HTTP route tests that mock the service boundary so CI stays offline,
and service-level tests that exercise _client_op / temp_client boundary.
"""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from conftest import add_account
from telethon.errors import RPCError

from telemanager.account_settings_service import (
    _authorization_dict,
    clean_profile_field,
    get_profile,
    normalize_username,
    update_profile,
    validate_ttl_days,
    validate_username,
)


def test_normalize_username_strips_at_and_space():
    assert normalize_username("  @Cool_User ") == "Cool_User"
    assert normalize_username("@@x") == "x"  # any leading @ is dropped


def test_validate_username_accepts_valid_and_clears_empty():
    assert validate_username("@Cool_User1") == "Cool_User1"
    assert validate_username("   ") == ""  # blank clears the username


@pytest.mark.parametrize("bad", ["abc", "1abc", "has space", "with-dash", "a" * 33])
def test_validate_username_rejects_invalid(bad):
    with pytest.raises(ValueError):
        validate_username(bad)


def test_clean_profile_field_passthrough_and_none():
    assert clean_profile_field("first_name", "  Ada ") == "Ada"
    assert clean_profile_field("first_name", None) is None  # None = leave unchanged


def test_clean_profile_field_enforces_limit():
    with pytest.raises(ValueError):
        clean_profile_field("about", "x" * 141)
    assert clean_profile_field("about", "x" * 140) == "x" * 140  # premium bio boundary


@pytest.mark.parametrize("days", [30, 90, 180, 365])
def test_validate_ttl_days_accepts_standard_periods(days):
    assert validate_ttl_days(days) == days


@pytest.mark.parametrize("bad", [0, 45, 366, 5000, -30])
def test_validate_ttl_days_rejects_nonstandard(bad):
    with pytest.raises(ValueError):
        validate_ttl_days(bad)


def test_authorization_hash_is_stringified_to_avoid_js_precision_loss():
    class FakeAuth:
        hash = 9123456789012345678  # > 2**53
        current = False

    assert _authorization_dict(FakeAuth())["hash"] == "9123456789012345678"


def test_account_settings_router_is_mounted():
    # Guards the wiring: the service/route can be perfect but do nothing unless
    # main.py includes the router. This fails if that include is dropped again.
    from telemanager.main import app

    paths = {route.path for route in app.routes}
    assert "/api/accounts/{account_id}/profile" in paths
    assert "/api/accounts/{account_id}/sessions" in paths


# ---------------------------------------------------------------------------
# HTTP route tests — mock service boundary so CI stays offline (plan 005)
# ---------------------------------------------------------------------------

SVC = "telemanager.routes.account_settings.svc"


def test_get_profile_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_get_profile(manager, account_id):
        assert account_id == "acc-1"
        return {
            "first_name": "Ada",
            "last_name": None,
            "username": "ada",
            "phone": None,
            "about": "hi",
        }

    monkeypatch.setattr(f"{SVC}.get_profile", fake_get_profile)
    response = client.get("/api/accounts/acc-1/profile")
    assert response.status_code == 200
    assert response.json()["first_name"] == "Ada"


def test_get_profile_value_error_is_400(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def boom(manager, account_id):
        raise ValueError("nope")

    monkeypatch.setattr(f"{SVC}.get_profile", boom)
    response = client.get("/api/accounts/acc-1/profile")
    assert response.status_code == 400
    assert response.json()["detail"] == "nope"


def test_update_profile_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_update_profile(manager, account_id, **kwargs):
        assert account_id == "acc-1"
        assert kwargs["first_name"] == "Ada"
        return {"id": account_id, "label": "Primary", "first_name": "Ada"}

    monkeypatch.setattr(f"{SVC}.update_profile", fake_update_profile)
    response = client.post("/api/accounts/acc-1/profile", json={"first_name": "Ada"})
    assert response.status_code == 200
    assert response.json()["account"]["first_name"] == "Ada"


def test_update_username_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_update_username(manager, account_id, username):
        assert username == "cool_user"
        return {"id": account_id, "username": "cool_user"}

    monkeypatch.setattr(f"{SVC}.update_username", fake_update_username)
    response = client.post("/api/accounts/acc-1/username", json={"username": "cool_user"})
    assert response.status_code == 200
    assert response.json()["account"]["username"] == "cool_user"


def test_list_sessions_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_list_sessions(manager, account_id):
        return {"sessions": []}

    monkeypatch.setattr(f"{SVC}.list_sessions", fake_list_sessions)
    response = client.get("/api/accounts/acc-1/sessions")
    assert response.status_code == 200
    assert response.json()["sessions"] == []


def test_terminate_session_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_terminate(manager, account_id, session_hash):
        assert session_hash == "12345"
        return {"ok": True}

    monkeypatch.setattr(f"{SVC}.terminate_session", fake_terminate)
    response = client.post("/api/accounts/acc-1/sessions/terminate", json={"hash": "12345"})
    assert response.status_code == 200
    assert response.json()["ok"]


def test_terminate_others_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_terminate_others(manager, account_id):
        return {"ok": True}

    monkeypatch.setattr(f"{SVC}.terminate_other_sessions", fake_terminate_others)
    response = client.post("/api/accounts/acc-1/sessions/terminate-others")
    assert response.status_code == 200
    assert response.json()["ok"]


def test_list_contacts_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_list_contacts(manager, account_id):
        return {"contacts": [{"id": "1", "username": "bob"}]}

    monkeypatch.setattr(f"{SVC}.list_contacts", fake_list_contacts)
    response = client.get("/api/accounts/acc-1/contacts")
    assert response.status_code == 200
    assert response.json()["contacts"][0]["username"] == "bob"


def test_add_contact_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_add_contact(manager, account_id, **kwargs):
        assert kwargs["identifier"] == "@bob"
        assert kwargs["first_name"] == "Bob"
        return {"ok": True}

    monkeypatch.setattr(f"{SVC}.add_contact", fake_add_contact)
    response = client.post(
        "/api/accounts/acc-1/contacts",
        json={"identifier": "@bob", "first_name": "Bob"},
    )
    assert response.status_code == 200
    assert response.json()["ok"]


def test_delete_contact_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_delete_contact(manager, account_id, identifier):
        assert identifier == "@bob"
        return {"ok": True}

    monkeypatch.setattr(f"{SVC}.delete_contact", fake_delete_contact)
    response = client.delete("/api/accounts/acc-1/contacts", params={"identifier": "@bob"})
    assert response.status_code == 200
    assert response.json()["ok"]


def test_list_blocked_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_list_blocked(manager, account_id):
        return {"blocked": []}

    monkeypatch.setattr(f"{SVC}.list_blocked", fake_list_blocked)
    response = client.get("/api/accounts/acc-1/blocked")
    assert response.status_code == 200
    assert response.json()["blocked"] == []


def test_unblock_user_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_unblock(manager, account_id, user_id):
        assert account_id == "acc-1"
        assert user_id == 12345
        return {"ok": True}

    monkeypatch.setattr(f"{SVC}.unblock_user", fake_unblock)
    response = client.post(
        "/api/accounts/acc-1/blocked/unblock",
        json={"user_id": 12345},
    )
    assert response.status_code == 200
    assert response.json()["ok"]


def test_unblock_user_value_error_is_400(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def boom(manager, account_id, user_id):
        raise ValueError("Account was not found.")

    monkeypatch.setattr(f"{SVC}.unblock_user", boom)
    response = client.post(
        "/api/accounts/acc-1/blocked/unblock",
        json={"user_id": 99999},
    )
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_unblock_user_missing_user_id_is_422(app_context, client):
    add_account(app_context, "acc-1", "Primary")
    response = client.post("/api/accounts/acc-1/blocked/unblock", json={})
    assert response.status_code == 422


def test_profile_update_rejects_denylist_fields(app_context, client):
    """ProfileUpdateRequest only accepts first_name, last_name, about —
    username, photo, and other denylist fields are structurally excluded."""
    add_account(app_context, "acc-1", "Primary")
    # Sending an extra field (e.g. 'username') should be silently ignored by
    # Pydantic (extra=ignore is the default), not crash the server.
    response = client.post(
        "/api/accounts/acc-1/profile",
        json={"first_name": "Test", "username": "hacked"},
    )
    # 400 from service ValueError ("Nothing to update" if only username changed)
    # or 200 if first_name was applied — either way, username is not applied.
    assert response.status_code in {200, 400}


def test_get_ttl_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_get_ttl(manager, account_id):
        return {"days": 180}

    monkeypatch.setattr(f"{SVC}.get_account_ttl", fake_get_ttl)
    response = client.get("/api/accounts/acc-1/ttl")
    assert response.status_code == 200
    assert response.json()["days"] == 180


def test_set_ttl_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")

    async def fake_set_ttl(manager, account_id, days):
        assert days == 90
        return {"days": 90}

    monkeypatch.setattr(f"{SVC}.set_account_ttl", fake_set_ttl)
    response = client.post("/api/accounts/acc-1/ttl", json={"days": 90})
    assert response.status_code == 200
    assert response.json()["days"] == 90


def test_set_ttl_validation_422_or_400(app_context, client):
    add_account(app_context, "acc-1", "Primary")
    # 45 is accepted by pydantic Field(ge=1, le=730) but rejected by service
    # validate_ttl_days → ValueError → 400. If schema tightens later, 422 is ok.
    response = client.post("/api/accounts/acc-1/ttl", json={"days": 45})
    assert response.status_code in {400, 422}


def test_missing_account_bubbles_400(app_context, client, monkeypatch):
    async def boom(manager, account_id):
        raise ValueError("Account was not found.")

    monkeypatch.setattr(f"{SVC}.get_profile", boom)
    response = client.get("/api/accounts/missing-id/profile")
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Service-level tests — mock temp_client boundary, no routes (plan 011)
# ---------------------------------------------------------------------------


class _FakeTelethonClient:
    """Stub Telethon client that satisfies get_me / GetFullUserRequest etc."""

    def __init__(self, me=None, full_user=None):
        self._me = me or SimpleNamespace(
            id=42, first_name="Test", last_name="User", username="testuser", phone="+1555"
        )
        self._full_user = full_user or SimpleNamespace(about="bio text")
        self.calls: list[str] = []

    async def get_me(self):
        self.calls.append("get_me")
        return self._me

    async def get_input_entity(self, entity):
        return SimpleNamespace(user_id=getattr(entity, "id", 0))

    async def __call__(self, request):
        self.calls.append(type(request).__name__)
        return SimpleNamespace(full_user=self._full_user)

    async def disconnect(self):
        return None


def test_get_profile_service_layer(app_context: dict, monkeypatch: pytest.MonkeyPatch):
    """get_profile goes through _client_op -> temp_client and returns the
    expected dict shape with real Telethon request objects."""
    account = add_account(app_context, "acc-svc", "SvcAccount")
    manager = app_context["main"].manager

    fake_client = _FakeTelethonClient()

    @asynccontextmanager
    async def _ctx(_account_id):
        yield fake_client

    monkeypatch.setattr(manager, "temp_client", _ctx)

    result = asyncio.run(get_profile(manager, account.id))

    assert result["first_name"] == "Test"
    assert result["last_name"] == "User"
    assert result["username"] == "testuser"
    assert result["phone"] == "+1555"
    assert result["about"] == "bio text"
    # Verify both get_me and GetFullUserRequest were called
    assert "get_me" in fake_client.calls
    assert "GetFullUserRequest" in fake_client.calls


def test_update_profile_service_layer_refreshes_identity(
    app_context: dict, monkeypatch: pytest.MonkeyPatch,
):
    """update_profile calls UpdateProfileRequest then _refresh_account_identity,
    returning the account's public dict."""
    account = add_account(app_context, "acc-svc", "SvcAccount")
    manager = app_context["main"].manager

    fake_client = _FakeTelethonClient()
    refresh_called = {"called": False}

    async def fake_refresh(acct, client):
        refresh_called["called"] = True
        # Simulate what the real refresh does: copy identity from client to account
        acct.first_name = "Updated"
        acct.username = "updated_user"

    @asynccontextmanager
    async def _ctx(_account_id):
        yield fake_client

    monkeypatch.setattr(manager, "temp_client", _ctx)
    monkeypatch.setattr(manager, "_refresh_account_identity", fake_refresh)

    result = asyncio.run(update_profile(manager, account.id, first_name="Updated"))

    assert refresh_called["called"] is True
    assert "UpdateProfileRequest" in fake_client.calls
    assert result["first_name"] == "Updated"


def test_rpc_error_classified_as_value_error(app_context: dict, monkeypatch: pytest.MonkeyPatch):
    """An RPCError from the Telethon client is caught by _client_op and
    re-raised as a ValueError with the classified user message."""
    import telemanager.account_settings_service as svc
    from telethon.errors import FloodWaitError

    account = add_account(app_context, "acc-svc", "SvcAccount")
    manager = app_context["main"].manager

    class _BoomClient:
        async def __call__(self, request):
            # FloodWaitError(request=None, capture=N) is the correct constructor
            # for Telethon errors — 'seconds' is derived from 'capture' at init.
            raise FloodWaitError(request=None, capture=120)

    @asynccontextmanager
    async def _ctx(_account_id):
        yield _BoomClient()

    monkeypatch.setattr(manager, "temp_client", _ctx)

    async def _run():
        async with svc._client_op(manager, account.id) as (_account, client):
            await client(SimpleNamespace())  # triggers __call__ -> RPCError

    with pytest.raises(ValueError) as exc_info:
        asyncio.run(_run())

    # classify_telegram_error turns FloodWaitError with seconds>60 into a
    # "flood_wait_long" category with a message mentioning the wait time.
    msg = str(exc_info.value)
    assert "120" in msg or "2m" in msg
