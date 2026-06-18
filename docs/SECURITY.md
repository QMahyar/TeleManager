# Security Guide

TeleManager handles Telegram user sessions. Treat every local session file, export, run history, and cached dialog dataset as sensitive authentication or operational material.

## Sensitive Files

Never commit or share:

- `sessions/`
- `data/config.json`
- `data/accounts.json`
- `data/action_presets.json`
- `data/action_runs.json`
- `data/safety_settings.json`
- `data/dialogs/`
- `data/exports/`
- `*.session`
- `*.session-journal`
- `.env` or `.env.*`
- local phone-number/account test lists
- real Telegram target inventories
- `AGENTS.md`

## Session Risk

A Telethon `.session` file can allow access to the Telegram account it belongs to. If a session file or export ZIP is leaked, revoke it from an official Telegram client by terminating the active session.

Session exports contain Telegram authentication material. Keep them private, move them only through trusted storage, and delete temporary copies when finished.

## Local-Only Default

The app is intended to run on `127.0.0.1`. Do not expose it to a LAN or public network until authentication, HTTPS, CSRF protection, and user access controls are added.

The recommended local command is:

```bash
python -m uvicorn telemanager.main:app --app-dir src --reload
```

Do not change the host to `0.0.0.0` unless the app has been secured for remote access.

## Queue Safety Model

TeleManager uses guarded action queues instead of unlimited direct automation:

- Account selection is explicit and scoped to the Actions page.
- Queue preview shows operation count, estimated duration, and warnings before execution.
- Queue execution requires confirmation.
- Delays and max operations are server-validated.
- Safety defaults are stored locally in `data/safety_settings.json`.
- Queue runs store operation-level status and results in `data/action_runs.json`.
- Cancellation is cooperative and stops before the next operation; it does not forcibly interrupt an in-flight Telegram request.
- Per-account failures are isolated during queue processing so one unavailable target does not abort the entire multi-account run.

Use conservative defaults, especially with older accounts or any action involving joins, messages, bot starts, or many targets.

## Dialog Safety Model

Dialog discovery and quick actions are powerful because they let operators pivot from a real Telegram chat directly into the Actions page.

Treat this workflow carefully:

- Cached dialogs in `data/dialogs/` may reveal usernames, channel names, bot names, and private conversation titles.
- Dialog quick actions can prefill destructive operations like delete, leave, clear, mute, archive, block, and report.
- Bulk dialog quick actions can target many dialogs at once across many selected accounts.
- Always review the action type, targets, and selected accounts before running a queue.

## Run History and Exports

Queue run history can include Telegram targets, action names, result details, and message text for failed or completed operations. Treat exported queue run JSON files as sensitive operational records.

Before sharing logs or bug reports, remove:

- phone numbers
- usernames and invite links
- message contents
- API IDs/hashes
- `.session` files or export ZIPs
- account labels that identify real people

## Responsible Use

Do not use this project for spam, scams, impersonation, unsolicited messaging, ban evasion, flood-limit evasion, or any activity that violates Telegram rules or harms other users.

Only message people or chats where you have permission or a clear expectation of contact. Only join, leave, clear, delete, or moderate dialogs for accounts and chats you own or are authorized to manage.

## Manual Testing Safety

Use `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` for real-session testing. Keep checklist notes local if they contain private test targets, phone numbers, or account identifiers.
