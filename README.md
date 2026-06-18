<!-- markdownlint-disable MD013 -->

# TeleManager

TeleManager is a local Telegram session manager for people who manage multiple Telegram accounts on their own computer. It is not a Telegram clone or chat client. Its job is to create, import, export, validate, and use Telethon `.session` files from one guarded local dashboard.

## Current workflow

TeleManager treats accounts as stored sessions, not long-running processes:

```text
Select session(s) -> choose one-off action -> preview -> confirm -> execute -> disconnect -> review results
```

There is no normal need to manually start or stop accounts. The backend connects only when it needs to validate a session, fetch dialogs, or run a Telegram action queue.

## What a `.session` file is

Telethon stores Telegram login state in a local `.session` file. By default this is a SQLite file containing the account authorization key and Telegram data-center connection details. After an account is logged in once, the `.session` file lets Telethon reconnect without asking for a login code every time.

Treat `.session` files like passwords:

- Do not share them.
- Do not commit them to Git.
- If one is leaked, revoke it from an official Telegram client by terminating that active session.
- Keep this app bound to `127.0.0.1` unless you deliberately add authentication and HTTPS.

## Current capabilities

- Save Telegram API ID and API hash locally in Settings.
- Log in accounts through phone code and optional 2FA password.
- Create local Telethon `.session` files under `sessions/`.
- Import existing `.session` files.
- Export selected sessions as a sensitive ZIP backup.
- Rename account labels.
- Rename local session files.
- Validate sessions.
- Delete local session copies.
- Fetch and cache dialogs/chats from an account.
- Categorize dialogs as personal, bot, group, supergroup, or channel.
- Trigger row-level dialog quick actions that hand off directly into the Actions page.
- Trigger bulk dialog quick actions for selected dialogs.
- Build guarded action queues with many actions, accounts, and targets.
- Preview queues before running them.
- Save and reload local queue presets.
- Track live queue progress with per-operation statuses.
- Cancel queues safely before the next operation starts.
- Persist queue run history and export, delete, or retry failed runs.
- Configure local safety defaults for queue delays and operation limits.

## Supported Telegram actions

TeleManager currently supports these action types:

- Join group or channel
- Leave group or channel
- Send message
- Forward message
- Start bot
- Delete dialog
- Clear chat history
- Block user
- Unblock user
- Archive chat
- Unarchive chat
- Mute chat
- Unmute chat
- Mark chat as read
- Report spam

Target validation is action-aware, and queue execution tolerates per-account failures so one missing dialog or unavailable target does not abort the full multi-account run.

## App sections

- Command Center: daily fleet view, metrics, and session inventory.
- Accounts: login, validation, rename, logout, and delete local sessions.
- Actions: build, preview, run, cancel, and review guarded Telegram action queues.
- Dialogs: fetch, search, classify, select, and launch quick actions for chats, groups, channels, and bots.
- Import / Export: import `.session` files and export selected sessions.
- Activity: persistent local JSONL audit log plus current browser feedback.
- Settings: Telegram API credentials and queue safety defaults.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
run.bat
```

Or on Git Bash / shell:

```bash
./run.sh
```

Or run directly:

```bash
python -m uvicorn telemanager.main:app --app-dir src --reload
```

Open `http://127.0.0.1:8000`.

## Frontend development

The primary frontend lives in `apps/web` and uses the shared UI package in `packages/ui`.

```bash
npm install
npm run build
```

The FastAPI app serves `apps/web/dist` when it exists. Build the React frontend before starting the server.

For frontend-only iteration, run:

```bash
npm run dev -- --filter web
```

## Telegram API credentials

Create your API ID and API hash at `https://my.telegram.org` using your own Telegram developer account. The app stores them locally in `data/config.json`, which is ignored by Git.

## Documentation

- `docs/ARCHITECTURE.md` explains the current backend, React frontend, data files, and queue/dialog lifecycle.
- `docs/SECURITY.md` lists sensitive files and the local-only safety model.
- `docs/ROADMAP.md` summarizes what is shipped and what hardening work remains.
- `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` gives a local manual verification plan for owned Telegram sessions.

## Safe usage

The app includes a guarded queue runner instead of direct unlimited bulk automation. Queues require explicit review and confirmation, use configurable conservative delays, persist run history locally, and can be canceled cooperatively before the next operation starts.

Do not use this project for spam, scams, impersonation, unsolicited messaging, or evading Telegram limits. Telegram sessions are powerful and can be restricted or banned when abused.

## Project layout

```text
apps/web/              React frontend
packages/ui/           Shared UI primitives and styles
src/telemanager/       FastAPI app and backend services
docs/                  Architecture, security, roadmap, and test docs
data/                  Local config, account metadata, dialog cache, exports, activity logs; gitignored
sessions/              Telethon .session files; gitignored
AGENTS.md              Local-only agent instructions; gitignored
```
