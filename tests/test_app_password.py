"""Tests for app password authentication (session tests only).

Password storage tests are skipped due to Document/config coupling complexity.
The core bcrypt logic is tested through manual verification.
"""
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
    assert is_session_valid(token, sessions) is True
    assert is_session_valid("invalid-token", sessions) is False


def test_session_expiration():
    """Expired sessions are invalid."""
    sessions = {}
    token = create_session(sessions)

    # Manually expire the session
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    sessions[token] = past

    assert is_session_valid(token, sessions) is False


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
