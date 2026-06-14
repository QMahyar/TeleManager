# TeleManager

TeleManager is a local Telegram session manager for people who manage multiple Telegram accounts on their own computer. It is not a Telegram clone or native chat app. Its first job is to create and manage Telethon `.session` files, then start, stop, and log out accounts from one local dashboard.

## What a `.session` file is

Telethon stores Telegram login state in a local `.session` file. By default this is a SQLite file containing the account authorization key and Telegram data-center connection details. After an account is logged in once, the `.session` file lets Telethon reconnect without asking for a login code every time.

Treat `.session` files like passwords:

- Do not share them.
- Do not commit them to Git.
- If one is leaked, revoke it from an official Telegram client by terminating that active session.
- Keep this app bound to `127.0.0.1` unless you deliberately add authentication and HTTPS.

## Current MVP

- Save Telegram API ID and API hash locally.
- Start login for a phone number.
- Confirm Telegram login code.
- Confirm 2FA password when Telegram requires it.
- Create local Telethon `.session` files under `sessions/`.
- Keep newly logged-in accounts stopped by default.
- List accounts with status, session filename, and local activity feedback.
- Start, stop, and log out one account.
- Start all, stop all, start selected, and stop selected accounts.
- Use a dark command-center dashboard UI for local account operations.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn telemanager.main:app --app-dir src --reload
```

Open `http://127.0.0.1:8000`.

## Telegram API credentials

Create your API ID and API hash at `https://my.telegram.org` using your own Telegram developer account. The app stores them locally in `data/config.json`, which is ignored by Git.

## Documentation

- `docs/ARCHITECTURE.md` explains the backend, frontend, data files, and session lifecycle.
- `docs/SECURITY.md` lists sensitive files and the local-only safety model.
- `docs/ROADMAP.md` outlines the next phases for account organization, guarded action queues, and hardening.

## Safe roadmap

The next phase should add a queued action system instead of direct unlimited bulk automation. Suggested actions:

- Join or open a Telegram link for selected accounts.
- Start a bot or referral link for selected accounts.
- Leave a channel or group for selected accounts.
- Delete a chat/dialog for selected accounts.
- Export account/session inventory without exporting session secrets.
- Add per-account notes, tags, and groups.
- Add proxies per account if you legitimately need separate network routing.
- Add rate limits, dry runs, action confirmations, and result logs.

Do not use this project for spam, scams, impersonation, unsolicited messaging, or evading Telegram limits. Telegram sessions are powerful and can be restricted or banned when abused.

## Project layout

```text
src/telemanager/        FastAPI app and account/session manager
src/telemanager/static/ Browser UI
docs/                   Architecture, security, and roadmap docs
data/                   Local config and account metadata, gitignored
sessions/               Telethon .session files, gitignored
AGENTS.md               Local-only agent instructions, gitignored
```
