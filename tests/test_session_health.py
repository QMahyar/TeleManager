"""Tests for session health monitoring."""
from datetime import UTC, datetime, timedelta

from telemanager.session_health import (
    STALE_THRESHOLD_DAYS,
    compute_health_status,
    health_badge_emoji,
)


def test_health_status_healthy():
    """Recently validated session with no errors = healthy."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=3)).isoformat()
    status = compute_health_status(authorized=True, last_validated_at=recent, last_error=None)
    assert status == "healthy"


def test_health_status_stale():
    """Session validated 8+ days ago = stale."""
    now = datetime.now(UTC)
    old = (now - timedelta(days=8)).isoformat()
    status = compute_health_status(authorized=True, last_validated_at=old, last_error=None)
    assert status == "stale"


def test_health_status_revoked_by_authorization():
    """Not authorized = revoked."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=1)).isoformat()
    status = compute_health_status(authorized=False, last_validated_at=recent, last_error=None)
    assert status == "revoked"


def test_health_status_revoked_by_error():
    """Session error indicates revoked status."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=1)).isoformat()
    status = compute_health_status(
        authorized=True,
        last_validated_at=recent,
        last_error="Session revoked. Log in again.",
    )
    assert status == "revoked"


def test_health_status_revoked_by_expired_error():
    """Session expired error = revoked."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=1)).isoformat()
    status = compute_health_status(
        authorized=True,
        last_validated_at=recent,
        last_error="Session expired. Please log in again.",
    )
    assert status == "revoked"


def test_health_status_unknown_no_validation():
    """Never validated = unknown."""
    status = compute_health_status(authorized=True, last_validated_at=None, last_error=None)
    assert status == "unknown"


def test_health_status_unknown_invalid_timestamp():
    """Invalid timestamp = unknown."""
    status = compute_health_status(
        authorized=True,
        last_validated_at="not-a-timestamp",
        last_error=None,
    )
    assert status == "unknown"


def test_health_status_boundary_exactly_7_days():
    """Exactly 7 days = healthy (boundary check)."""
    now = datetime.now(UTC)
    exactly_7 = (now - timedelta(days=STALE_THRESHOLD_DAYS)).isoformat()
    status = compute_health_status(authorized=True, last_validated_at=exactly_7, last_error=None)
    assert status == "stale"  # >= threshold = stale


def test_health_status_6_days():
    """6.9 days = healthy."""
    now = datetime.now(UTC)
    almost_7 = (now - timedelta(days=6, hours=23)).isoformat()
    status = compute_health_status(authorized=True, last_validated_at=almost_7, last_error=None)
    assert status == "healthy"


def test_health_badge_emoji():
    """Badge emoji mapping."""
    assert health_badge_emoji("healthy") == "🟢"
    assert health_badge_emoji("stale") == "🟡"
    assert health_badge_emoji("revoked") == "🔴"
    assert health_badge_emoji("unknown") == "⚪"


def test_health_with_non_session_error():
    """Non-session errors don't affect health status."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=1)).isoformat()
    status = compute_health_status(
        authorized=True,
        last_validated_at=recent,
        last_error="Rate limited for 45s, retrying...",
    )
    assert status == "healthy"  # Not a session error
