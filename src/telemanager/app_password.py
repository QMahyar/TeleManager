"""Optional app-level password protection for shared/work machines.

Adds an opt-in password prompt on launch and session-based authentication to
secure localhost access when TeleManager runs on a shared computer.
"""
from __future__ import annotations

import secrets
import time
from datetime import UTC, datetime, timedelta

import bcrypt

# Shared app-settings document (Path-based, under DATA_DIR). The password hash lives
# here alongside other app settings; reusing the one shared doc keeps both readers in
# sync and avoids a second, relative-path Document that wrote to the wrong place.
from .documents import app_settings_doc

# Session tokens valid for 24 hours
SESSION_DURATION_HOURS = 24

# --- Login rate-limiting (in-memory, single-user local app) ---
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 30

_login_failure_count: int = 0
_login_locked_until: float = 0.0  # monotonic timestamp


def record_failed_login() -> None:
    """Record a failed login attempt. Locks out after MAX_LOGIN_ATTEMPTS."""
    global _login_failure_count, _login_locked_until
    _login_failure_count += 1
    if _login_failure_count >= MAX_LOGIN_ATTEMPTS:
        _login_locked_until = time.monotonic() + LOGIN_LOCKOUT_SECONDS


def clear_login_failures() -> None:
    """Reset the failure counter (called on successful login/setup)."""
    global _login_failure_count, _login_locked_until
    _login_failure_count = 0
    _login_locked_until = 0.0


def login_backoff_seconds() -> int:
    """Return 0 if login is allowed, or seconds remaining until lockout expires."""
    if _login_locked_until <= 0.0:
        return 0
    remaining = _login_locked_until - time.monotonic()
    if remaining <= 0:
        return 0
    return int(remaining) + 1  # ceiling-ish: report at least 1 while locked


def reset_login_rate_limit() -> None:
    """Reset rate-limit state. For use in tests only."""
    global _login_failure_count, _login_locked_until
    _login_failure_count = 0
    _login_locked_until = 0.0


def is_password_enabled() -> bool:
    """Check if app password is enabled."""
    settings = app_settings_doc.read({})
    return bool(settings.get("password_hash"))


def verify_app_password(password: str) -> bool:
    """Verify password against stored hash."""
    settings = app_settings_doc.read({})
    password_hash = settings.get("password_hash")
    if not password_hash:
        return True  # No password set = always valid

    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, AttributeError):
        return False


def set_app_password(password: str) -> None:
    """Hash and store app password. Pass empty string to disable."""
    settings = app_settings_doc.read({})

    if not password.strip():
        # Disable password protection
        settings.pop("password_hash", None)
    else:
        # Hash and store
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(password.encode("utf-8"), salt)
        settings["password_hash"] = password_hash.decode("utf-8")

    app_settings_doc.write(settings)


def create_session_token() -> str:
    """Generate a new session token."""
    return secrets.token_urlsafe(32)


def is_session_valid(token: str, sessions: dict[str, str]) -> bool:
    """Check if session token is valid and not expired."""
    if token not in sessions:
        return False

    try:
        expires_str = sessions[token]
        expires = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
        return datetime.now(UTC) < expires
    except (ValueError, KeyError):
        return False


def create_session(sessions: dict[str, str]) -> str:
    """Create a new session and return token."""
    token = create_session_token()
    expires = datetime.now(UTC) + timedelta(hours=SESSION_DURATION_HOURS)
    sessions[token] = expires.isoformat()
    return token


def clear_expired_sessions(sessions: dict[str, str]) -> None:
    """Remove expired sessions from the dict."""
    now = datetime.now(UTC)
    expired = [
        token
        for token, expires_str in list(sessions.items())
        if datetime.fromisoformat(expires_str.replace("Z", "+00:00")) <= now
    ]
    for token in expired:
        sessions.pop(token, None)
