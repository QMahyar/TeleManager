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
    login_backoff_seconds,
    record_failed_login,
    reset_login_rate_limit,
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


def test_rotate_invalidates_old_session(app_context: dict, client) -> None:
    """Rotating the password clears all active sessions."""
    enable_password(client, "old-pass")
    clear_session_cookies(client)

    # Log in with the original password
    assert login(client, "old-pass").status_code == 200
    token = client.cookies.get("telemanager_session")
    assert token
    assert token in app_context["main"].active_sessions

    # Rotate — old session must be evicted
    rotated = client.post(
        "/api/auth/setup",
        json={"password": "new-pass", "current_password": "old-pass"},
    )
    assert rotated.status_code == 200
    assert token not in app_context["main"].active_sessions

    # Old cookie is rejected
    client.cookies.set("telemanager_session", token)
    assert client.get("/api/config").status_code == 401

    # New password login still works
    clear_session_cookies(client)
    assert login(client, "new-pass").status_code == 200
    assert client.get("/api/config").status_code == 200


def test_disable_invalidates_old_session(app_context: dict, client) -> None:
    """Disabling the password clears all active sessions so re-enabling starts clean."""
    enable_password(client, "secret-pass")
    clear_session_cookies(client)

    assert login(client, "secret-pass").status_code == 200
    token = client.cookies.get("telemanager_session")
    assert token
    assert token in app_context["main"].active_sessions

    # Disable — old session must be evicted
    disabled = client.post(
        "/api/auth/setup",
        json={"password": "", "current_password": "secret-pass"},
    )
    assert disabled.status_code == 200
    assert token not in app_context["main"].active_sessions
    assert len(app_context["main"].active_sessions) == 0

    # Re-enable with a new password — the old token is still gone
    client.cookies.set("telemanager_session", token)
    re_enabled = client.post(
        "/api/auth/setup",
        json={"password": "fresh-pass"},
    )
    assert re_enabled.status_code == 200
    assert token not in app_context["main"].active_sessions
    blocked = client.get("/api/config")
    assert blocked.status_code == 401


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


# ---------------------------------------------------------------------------
# Rate-limiting (plan 003)
# ---------------------------------------------------------------------------


def test_rate_limit_unit_helpers():
    """record_failed_login increments counter; backoff returns 0 until threshold."""
    reset_login_rate_limit()
    for _ in range(4):
        record_failed_login()
        assert login_backoff_seconds() == 0
    # 5th failure triggers lockout
    record_failed_login()
    assert login_backoff_seconds() > 0
    reset_login_rate_limit()
    assert login_backoff_seconds() == 0


def test_login_429_after_five_failures(client) -> None:
    """5 wrong passwords then the 6th attempt returns 429."""
    enable_password(client)
    clear_session_cookies(client)

    for _ in range(5):
        resp = login(client, password="wrong")
        assert resp.status_code == 401

    resp = login(client, password="wrong")
    assert resp.status_code == 429
    assert "Too many" in resp.json()["detail"]


def test_successful_login_resets_rate_limit(client) -> None:
    """A correct password after 4 failures clears the counter."""
    enable_password(client)
    clear_session_cookies(client)

    for _ in range(4):
        login(client, password="wrong")

    # Correct login should succeed and reset
    resp = login(client)
    assert resp.status_code == 200
    # Subsequent wrong password should be 401, not 429
    clear_session_cookies(client)
    resp = login(client, password="wrong")
    assert resp.status_code == 401


def test_setup_clears_rate_limit(client) -> None:
    """Rotating the password via setup resets the login counter."""
    enable_password(client)
    clear_session_cookies(client)

    for _ in range(5):
        login(client, password="wrong")
    assert login(client, password="wrong").status_code == 429

    # Rotate clears failures
    client.post(
        "/api/auth/setup",
        json={"password": "new-pass", "current_password": "secret-pass"},
    )
    clear_session_cookies(client)
    resp = login(client, password="wrong")
    assert resp.status_code == 401  # back to normal 401, not 429
    # New password works
    assert login(client, password="new-pass").status_code == 200


def test_correct_password_still_401_when_not_locked(client) -> None:
    """Wrong password returns 401, not 429, when under the threshold."""
    enable_password(client)
    clear_session_cookies(client)

    resp = login(client, password="wrong")
    assert resp.status_code == 401
    assert "Too many" not in resp.json().get("detail", "")
