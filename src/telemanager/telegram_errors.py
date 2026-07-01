"""Telegram error classification and user-friendly messaging.

Parses Telethon exceptions into actionable categories with clear guidance for
operators. Auto-retry logic for transient errors lives in the queue worker.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from telethon.errors import (
    ChannelBannedError,
    ChannelPrivateError,
    ChatAdminRequiredError,
    ChatForbiddenError,
    ChatRestrictedError,
    ChatWriteForbiddenError,
    FloodWaitError,
    PeerFloodError,
    PeerIdInvalidError,
    PhoneNumberBannedError,
    SessionExpiredError,
    SessionRevokedError,
    UserBannedInChannelError,
    UserDeactivatedBanError,
    UserPrivacyRestrictedError,
)


@dataclass
class TelegramErrorInfo:
    """Classified Telegram error with user guidance."""

    category: str  # flood_wait, session_invalid, permission_denied, etc.
    user_message: str  # Clear, actionable message for the operator
    retryable: bool  # Can this be auto-retried?
    retry_after_seconds: int | None = None  # Auto-retry delay (None = don't retry)
    action: str | None = None  # Suggested user action: "relogin", "wait", "check_permissions"


def classify_telegram_error(error: Exception) -> TelegramErrorInfo:
    """Parse a Telethon exception into an actionable error category.

    Returns TelegramErrorInfo with user-friendly message and retry guidance.
    Falls back to a generic classification for unknown error types.
    """
    # FloodWaitError — rate limit with known wait time
    if isinstance(error, FloodWaitError):
        seconds = getattr(error, "seconds", 0) or 0
        if seconds <= 60:
            return TelegramErrorInfo(
                category="flood_wait_short",
                user_message=f"Rate limited by Telegram. Retrying in {seconds}s...",
                retryable=True,
                retry_after_seconds=seconds,
                action="wait",
            )
        return TelegramErrorInfo(
            category="flood_wait_long",
            user_message=f"Rate limited by Telegram for {seconds}s ({seconds // 60}m). Retry this operation later.",
            retryable=False,
            retry_after_seconds=seconds,
            action="wait",
        )

    # Session revoked/expired — needs re-login
    if isinstance(error, (SessionRevokedError, SessionExpiredError)):
        return TelegramErrorInfo(
            category="session_invalid",
            user_message="Session revoked or expired. Log in again from the Accounts screen.",
            retryable=False,
            action="relogin",
        )

    # PeerFloodError — too many requests to unknown peers (anti-spam)
    if isinstance(error, PeerFloodError):
        return TelegramErrorInfo(
            category="peer_flood",
            user_message=(
                "Telegram flagged this account for spam-like behavior. "
                "Wait 24-48h before messaging unknown contacts."
            ),
            retryable=False,
            action="wait",
        )

    # Account banned
    if isinstance(error, (PhoneNumberBannedError, UserDeactivatedBanError)):
        return TelegramErrorInfo(
            category="account_banned",
            user_message="This account is banned by Telegram. Contact Telegram support or use a different account.",
            retryable=False,
            action="contact_support",
        )

    # User banned in specific channel/chat
    if isinstance(error, UserBannedInChannelError):
        return TelegramErrorInfo(
            category="banned_in_chat",
            user_message="This account is banned from this chat. Use a different account or contact the chat admin.",
            retryable=False,
            action="check_permissions",
        )

    # Permission errors (chat-level)
    if isinstance(error, (ChatAdminRequiredError, ChatWriteForbiddenError)):
        return TelegramErrorInfo(
            category="permission_denied",
            user_message="No permission for this action. You may need admin rights or membership in this chat.",
            retryable=False,
            action="check_permissions",
        )

    # Chat access errors (private, forbidden, restricted)
    if isinstance(error, (ChannelPrivateError, ChatForbiddenError, ChannelBannedError, ChatRestrictedError)):
        return TelegramErrorInfo(
            category="chat_inaccessible",
            user_message="Cannot access this chat. It may be private, deleted, or you were removed.",
            retryable=False,
            action="check_target",
        )

    # User privacy restrictions
    if isinstance(error, UserPrivacyRestrictedError):
        return TelegramErrorInfo(
            category="privacy_restricted",
            user_message="Target user's privacy settings prevent this action.",
            retryable=False,
            action="check_target",
        )

    # Invalid peer/target
    if isinstance(error, PeerIdInvalidError):
        return TelegramErrorInfo(
            category="invalid_target",
            user_message="Invalid target ID or username. Check the target and try again.",
            retryable=False,
            action="check_target",
        )

    # Network/timeout errors (transient)
    error_str = str(error).lower()
    if any(keyword in error_str for keyword in ["timeout", "connection", "network", "socket"]):
        return TelegramErrorInfo(
            category="network_error",
            user_message="Network error. Retrying...",
            retryable=True,
            retry_after_seconds=5,
            action="retry",
        )

    # Generic Telegram error — extract message if possible
    error_msg = str(error)
    # Strip common Telethon prefixes like "RPC_CALL_FAIL" or error codes
    clean_msg = re.sub(r"^[A-Z_]+:\s*", "", error_msg)
    clean_msg = clean_msg[:200]  # Cap length

    return TelegramErrorInfo(
        category="telegram_error",
        user_message=f"Telegram error: {clean_msg}",
        retryable=False,
        action=None,
    )


def should_auto_retry(error_info: TelegramErrorInfo) -> bool:
    """Whether this error should trigger automatic retry in the queue worker."""
    return error_info.retryable and error_info.retry_after_seconds is not None and error_info.retry_after_seconds <= 60
