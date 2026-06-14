# Roadmap

## Phase 1: Session Manager

- Save Telegram API ID and API hash locally.
- Log in accounts through phone code and optional 2FA password.
- Create local Telethon `.session` files.
- Keep newly logged-in accounts stopped by default.
- Start, stop, log out, start selected, stop selected, start all, and stop all.

## Phase 2: Account Organization

- Account tags and groups.
- Search and filtering.
- Per-account notes.
- Import/export metadata without session secrets.
- Optional per-account proxy configuration.

## Phase 3: Guarded Action Queue

- Join/open Telegram link for selected accounts.
- Start a bot or referral link for selected accounts.
- Leave a channel or group.
- Delete a chat/dialog.
- Dry-run preview before execution.
- Rate-limited queue with per-account results.
- Persistent audit history.

## Phase 4: Hardening

- Local app password.
- CSRF protection.
- Optional encrypted config/session storage.
- Better error taxonomy for Telegram flood waits, invalid sessions, revoked sessions, and network failures.
- Test suite with mocked Telethon clients.
