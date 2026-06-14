# Security Guide

TeleManager handles Telegram user sessions. Treat every local session file as sensitive authentication material.

## Sensitive files

Never commit or share:

- `sessions/`
- `data/config.json`
- `data/accounts.json`
- `*.session`
- `*.session-journal`
- `.env` or `.env.*`
- local phone-number/account test lists
- `AGENTS.md`

## Session risk

A Telethon `.session` file can allow access to the Telegram account it belongs to. If a session file is leaked, revoke it from an official Telegram client by terminating the active session.

## Local-only default

The app is intended to run on `127.0.0.1`. Do not expose it to a LAN or public network until authentication, HTTPS, CSRF protection, and user access controls are added.

## Bulk action policy

Future bulk Telegram actions should use:

- explicit account selection
- confirmation dialogs
- dry-run previews
- per-account rate limits
- action queues
- durable audit logs
- clear failure reporting

Do not use this project for spam, scams, impersonation, unsolicited messaging, or evading Telegram limits.
