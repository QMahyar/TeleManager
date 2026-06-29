"""Tests for Telegram error classification and retry logic."""
from telethon.errors import (
    ChannelPrivateError,
    ChatAdminRequiredError,
    FloodWaitError,
    PeerFloodError,
    PeerIdInvalidError,
    PhoneNumberBannedError,
    SessionRevokedError,
    UserPrivacyRestrictedError,
)

from telemanager.telegram_errors import classify_telegram_error, should_auto_retry


def test_flood_wait_short():
    error = FloodWaitError(request=None, capture=45)
    info = classify_telegram_error(error)
    assert info.category == "flood_wait_short"
    assert info.retryable is True
    assert info.retry_after_seconds == 45
    assert "45s" in info.user_message
    assert should_auto_retry(info) is True


def test_flood_wait_long():
    error = FloodWaitError(request=None, capture=300)
    info = classify_telegram_error(error)
    assert info.category == "flood_wait_long"
    assert info.retryable is False
    assert info.retry_after_seconds == 300
    assert "5m" in info.user_message
    assert should_auto_retry(info) is False


def test_session_revoked():
    error = SessionRevokedError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "session_invalid"
    assert info.retryable is False
    assert info.action == "relogin"
    assert "log in again" in info.user_message.lower()


def test_peer_flood():
    error = PeerFloodError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "peer_flood"
    assert info.retryable is False
    assert "spam" in info.user_message.lower() or "24" in info.user_message


def test_account_banned():
    error = PhoneNumberBannedError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "account_banned"
    assert info.retryable is False
    assert "banned" in info.user_message.lower()


def test_permission_denied():
    error = ChatAdminRequiredError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "permission_denied"
    assert info.retryable is False
    assert info.action == "check_permissions"
    assert "permission" in info.user_message.lower()


def test_chat_inaccessible():
    error = ChannelPrivateError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "chat_inaccessible"
    assert info.retryable is False
    assert "access" in info.user_message.lower() or "private" in info.user_message.lower()


def test_privacy_restricted():
    error = UserPrivacyRestrictedError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "privacy_restricted"
    assert info.retryable is False
    assert "privacy" in info.user_message.lower()


def test_invalid_target():
    error = PeerIdInvalidError(request=None)
    info = classify_telegram_error(error)
    assert info.category == "invalid_target"
    assert info.retryable is False
    assert "invalid" in info.user_message.lower()


def test_network_error():
    error = TimeoutError("Connection timeout")
    info = classify_telegram_error(error)
    assert info.category == "network_error"
    assert info.retryable is True
    assert info.retry_after_seconds == 5
    assert should_auto_retry(info) is True


def test_generic_error():
    error = ValueError("Some unknown error")
    info = classify_telegram_error(error)
    assert info.category == "telegram_error"
    assert "unknown error" in info.user_message.lower()


def test_auto_retry_logic():
    # Short flood wait: should retry
    short_flood = classify_telegram_error(FloodWaitError(request=None, capture=30))
    assert should_auto_retry(short_flood) is True

    # Long flood wait: should not retry
    long_flood = classify_telegram_error(FloodWaitError(request=None, capture=120))
    assert should_auto_retry(long_flood) is False

    # Session revoked: should not retry
    session_error = classify_telegram_error(SessionRevokedError(request=None))
    assert should_auto_retry(session_error) is False

    # Network error: should retry
    network_error = classify_telegram_error(TimeoutError("timeout"))
    assert should_auto_retry(network_error) is True
