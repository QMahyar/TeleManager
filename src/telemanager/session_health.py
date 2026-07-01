"""Session health monitoring for proactive validation.

Tracks session health status (healthy/stale/revoked) and provides background
validation to catch expired sessions before they cause queue failures.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

HealthStatus = Literal["healthy", "stale", "revoked", "unknown"]

# Session is stale if not validated in 7+ days
STALE_THRESHOLD_DAYS = 7


def compute_health_status(
    authorized: bool,
    last_validated_at: str | None,
    last_error: str | None,
) -> HealthStatus:
    """Compute session health status based on validation history and errors.

    - healthy: validated within 7 days, no session errors
    - stale: not validated in 7+ days (may still work, but needs check)
    - revoked: last error indicates session is invalid
    - unknown: never validated or no validation timestamp
    """
    if not authorized:
        return "revoked"

    # Check if last error indicates session invalidity
    if last_error and any(
        keyword in last_error.lower()
        for keyword in ["revoked", "expired", "not authorized", "log in again"]
    ):
        return "revoked"

    # No validation timestamp = unknown
    if not last_validated_at:
        return "unknown"

    try:
        validated = datetime.fromisoformat(last_validated_at.replace("Z", "+00:00"))
        now = datetime.now(UTC)
        days_since = (now - validated).days

        if days_since < STALE_THRESHOLD_DAYS:
            return "healthy"
        return "stale"
    except (ValueError, AttributeError):
        return "unknown"


def health_badge_emoji(status: HealthStatus) -> str:
    """Return emoji for health status badge."""
    match status:
        case "healthy":
            return "🟢"
        case "stale":
            return "🟡"
        case "revoked":
            return "🔴"
        case "unknown":
            return "⚪"
