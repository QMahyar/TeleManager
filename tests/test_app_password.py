"""App password: pure session helpers + HTTP middleware/route contracts.

Unit tests cover the in-memory session dict. HTTP tests exercise the plan-001
auth surface via TestClient (middleware 401, setup current-password, logout).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from telemanager.app_password import (
    SESSION_DURATION_HOURS,
    clear_expired_sessions,
    create_session,
    is_session_valid,
)


def test_session_creation_and_validation():
    """Create session and validate token."""
    sessions = {}
    token = create_session(sessions)

    assert len(token) > 20  # URL-safe token
    assert token in sessions
    assert is_session_valid(token, sessions)
    assert not is_session_valid("invalid-token", sessions)


def test_session_expiration():
    """Expired sessions are invalid."""
    sessions = {}
    token = create_session(sessions)

    # Manually expire the session
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    sessions[token] = past

    assert not is_session_valid(token, sessions)


def test_clear_expired_sessions():
    """Expired sessions are removed from dict."""
    sessions = {}

    # Create valid session
    valid_token = create_session(sessions)

    # Create expired session
    expired_token = "expired-token"
    past = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
    sessions[expired_token] = past

    assert len(sessions) == 2

    clear_expired_sessions(sessions)

    assert len(sessions) == 1
    assert valid_token in sessions
    assert expired_token not in sessions


def test_session_duration():
    """Session expires after SESSION_DURATION_HOURS."""
    sessions = {}
    token = create_session(sessions)

    expires_str = sessions[token]
    expires = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
    created = datetime.now(UTC)

    delta = expires - created
    # Should be close to SESSION_DURATION_HOURS (allow 1 minute variance)
    assert abs(delta.total_seconds() - SESSION_DURATION_HOURS * 3600) < 60


# ---------------------------------------------------------------------------
# HTTP contracts (plan 002) — require plan-001 middleware/setup/logout
# ---------------------------------------------------------------------------


def enable_password(client, password: str = "secret-pass") -> None:
    response = client.post("/api/auth/setup", json={"password": password})
    assert response.status_code == 200
    assert response.json()["password_enabled"]


def login(client, password: str = "secret-pass"):
    return client.post("/api/auth/login", data={"password": password})


def clear_session_cookies(client) -> None:
    """Drop the session cookie so the next request is unauthenticated."""
    client.cookies.clear()


def test_api_open_when_password_disabled(client) -> None:
    response = client.get("/api/config")
    assert response.status_code == 200
    assert "api_hash_configured" in response.json()


def test_api_401_when_password_enabled_without_session(client) -> None:
    enable_password(client)
    clear_session_cookies(client)

    response = client.get("/api/config")
    assert response.status_code == 401
    detail = str(response.json().get("detail", "")).lower()
    assert "authentication" in detail or "log in" in detail


def test_spa_index_allowed_when_password_enabled_without_session(client) -> None:
    enable_password(client)
    clear_session_cookies(client)

    response = client.get("/")
    assert response.status_code == 200


def test_auth_status_always_public(client) -> None:
    enable_password(client)
    clear_session_cookies(client)

    response = client.get("/api/auth/status")
    assert response.status_code == 200
    assert response.json()["password_enabled"]


def test_login_sets_cookie_and_unlocks_api(client) -> None:
    enable_password(client)
    clear_session_cookies(client)

    response = login(client)
    assert response.status_code == 200
    assert response.json().get("ok")

    unlocked = client.get("/api/config")
    assert unlocked.status_code == 200


def test_login_rejects_wrong_password(client) -> None:
    enable_password(client)
    clear_session_cookies(client)

    response = login(client, password="wrong-password")
    assert response.status_code == 401

    blocked = client.get("/api/config")
    assert blocked.status_code == 401


def test_saving_app_preferences_preserves_password_and_private_keys(app_context: dict, client) -> None:
    enable_password(client)
    assert login(client).status_code == 200

    app_settings_doc = __import__("telemanager.documents", fromlist=["app_settings_doc"]).app_settings_doc
    with app_settings_doc.mutate({}) as settings:
        settings["private_sentinel"] = "preserved"

    saved = client.post("/api/settings/app", json={"show_dialog_photos": False})
    assert saved.status_code == 200
    assert saved.json() == {"settings": {"show_dialog_photos": False}}
    assert app_settings_doc.read({})["private_sentinel"] == "preserved"

    clear_session_cookies(client)
    assert client.get("/api/auth/status").json()["password_enabled"] is True
    assert client.get("/api/config").status_code == 401
    assert login(client).status_code == 200


def test_setup_requires_current_password_when_enabled(client) -> None:
    enable_password(client, "a")
    # setup does not create a session cookie; clear for a clean unauthenticated state
    clear_session_cookies(client)

    denied = client.post("/api/auth/setup", json={"password": "b"})
    assert denied.status_code in {400, 401}

    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json()["password_enabled"]

    # Original password still works
    assert login(client, "a").status_code == 200
    assert client.get("/api/config").status_code == 200


def test_setup_rotate_with_current_password(client) -> None:
    enable_password(client, "a")
    clear_session_cookies(client)

    rotated = client.post(
        "/api/auth/setup",
        json={"password": "b", "current_password": "a"},
    )
    assert rotated.status_code == 200
    assert rotated.json()["password_enabled"]

    clear_session_cookies(client)
    assert login(client, "a").status_code == 401
    assert login(client, "b").status_code == 200
    assert client.get("/api/config").status_code == 200


def test_setup_disable_with_current_password(client) -> None:
    enable_password(client, "secret-pass")
    clear_session_cookies(client)

    disabled = client.post(
        "/api/auth/setup",
        json={"password": "", "current_password": "secret-pass"},
    )
    assert disabled.status_code == 200
    assert not disabled.json()["password_enabled"]

    clear_session_cookies(client)
    open_api = client.get("/api/config")
    assert open_api.status_code == 200


def test_logout_invalidates_server_session(app_context: dict, client) -> None:
    enable_password(client)
    clear_session_cookies(client)

    assert login(client).status_code == 200
    token = client.cookies.get("telemanager_session")
    assert token
    assert token in app_context["main"].active_sessions

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert token not in app_context["main"].active_sessions

    # Re-attach the old cookie value — server must reject it
    client.cookies.set("telemanager_session", token)
    blocked = client.get("/api/config")
    assert blocked.status_code == 401
