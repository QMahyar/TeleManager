<!-- markdownlint-disable MD013 -->

# TeleManager

TeleManager is a **local-first Telegram session manager** for people who manage
multiple **owned Telegram accounts** on their own machine.

It is **not** a Telegram replacement, a hosted dashboard, or a bulk automation
platform. Its job is narrower and safer:

- create and manage local Telethon `.session` files
- validate stored sessions
- inspect dialogs from a selected account
- build **guarded** one-off action queues
- keep a local audit trail of what ran

Current release: **`v1.11.0`**

## Why it exists

When you work with Telethon directly, session files, targets, delays, and
one-off account actions are easy to manage badly. TeleManager wraps that work in
one dashboard so the operator can:

- keep sessions in one place
- avoid constantly re-logging accounts
- preview actions before execution
- queue multi-account work conservatively
- export/import session backups safely
- review local run history afterward

## What it does

TeleManager currently supports:

### Session management

- save Telegram API credentials locally
- log in accounts with phone code and optional 2FA password
- create local Telethon `.session` files under `sessions/`
- import existing `.session` files
- export selected sessions as a ZIP backup
- rename account labels
- rename local session filenames
- validate stored sessions
- log out sessions from Telegram
- delete local session copies from this machine

### Dialog discovery

- fetch dialogs for a selected account
- cache dialog metadata locally
- classify dialogs as personal, bot, group, supergroup, or channel
- search/filter cached dialogs
- select dialogs and hand them off to the Actions screen
- use row-level and bulk quick actions

### Guarded Telegram actions

- join group or channel
- leave group or channel
- send message
- forward message
- start bot
- delete dialog
- clear chat history
- block user
- unblock user
- archive chat
- unarchive chat
- mute chat
- unmute chat
- mark chat as read
- report spam

### Queueing and audit

- build multi-step action queues
- preview queues before running them
- enforce queue confirmation before execution
- apply conservative delay defaults
- cap max queued operations
- track live queue progress
- cancel before the next operation starts
- store recent queue history locally
- retry failed operations as a new run
- export queue run data
- write local activity events to JSONL

### Recurring schedules

Build a queue on the **Actions** page, then flip the **Run now / Schedule** toggle
to schedule it — pick how to repeat (every N minutes/hours/days; start now, after
a delay, or at a set time; end after a number of times, on a date, or never).
TeleManager picks the delivery engine automatically:

- **Telegram-delivered (offline):** text-only schedules (plain messages and a
  plain `/start`) are pre-loaded as Telegram-native scheduled messages, so they
  keep firing even when TeleManager is closed. When the whole series fits inside
  Telegram's **100-per-chat (365 days out)** limit it is pre-scheduled all at
  once and is *fully offline*; longer series keep a rolling buffer topped up
  whenever the app is open.
- **In-app runner (app open):** any other action (join, mute, `/start` with a
  referral, etc.) runs as a normal queue each time it fires, so the app must be
  open at fire time.

Extras: an optional **stagger** offsets identical sends across chats so they
don't all fire at the same instant, and an **inspector** lets you pick an account
and chat to see exactly what Telegram has scheduled there (marking which messages
TeleManager created) and clear selected or all of them.

Each schedule can be previewed, paused/resumed, run immediately, and deleted.
Deleting a Telegram-delivered schedule also removes the messages it pre-scheduled.

## Core model

TeleManager treats accounts as **stored sessions**, not long-running services.

Normal workflow:

```text
Select session(s) -> choose one-off action -> preview -> confirm -> execute -> disconnect -> review results
```

The backend only connects when needed to:

- validate a session
- fetch dialogs
- run a Telegram action or queue

There is no normal need to manually start or stop accounts.

## What a `.session` file is

Telethon stores Telegram login state in a local `.session` file.

In practice, that file is sensitive authentication material. Treat it like a
password or a browser session cookie:

- do not share it
- do not commit it
- do not upload exported ZIPs to cloud storage casually
- revoke it from an official Telegram client if you think it leaked

If someone gets your `.session`, they may be able to act as that account until
Telegram invalidates it.

## Safety model

TeleManager is intentionally conservative.

### Built-in guardrails

- binds to `127.0.0.1`
- stores data locally only
- requires explicit queue confirmation
- supports configurable delays between actions/accounts
- limits total queue operations
- logs local activity and queue history
- tolerates per-account failures instead of crashing the whole queue
- cancels cooperatively before the next operation starts

### Explicit non-goals

Scheduling and queueing are for automating **your own** accounts against targets
you own or are clearly expected to act on (for example, starting your own bot, or
posting to a channel you run). They are **not** for:

- spam
- scams
- impersonation
- unsolicited messaging to people who did not ask for it
- ban/limit evasion
- mass abuse workflows

Recurring schedules make it easy to send a lot of traffic; keep intervals
conservative and only target chats and bots where you have clear permission or
expectation. Telegram still applies its own flood limits regardless of TeleManager.

If you need remote multi-user auth, HTTPS, roles, or hosted operation, that is
outside the current scope.

## UI sections

### Command Center

High-level workspace view with fleet metrics and session inventory.

### Dialogs

Fetch, cache, search, classify, and select chats, channels, groups, and bots.
Row and bulk **quick actions run in place** on the fetched account: parameterless
actions (mute, archive, read, leave…) in one tap, destructive ones behind a
confirm, and input actions (send message, forward, schedule…) via an inline
mini-prompt.

### Actions

Build, preview, run, cancel, and review guarded Telegram action queues — and turn
the same queue into a recurring schedule. A **Run now / Schedule** toggle switches
between executing immediately and scheduling (cadence, start/end, stagger,
preview). Tabs beneath the builder hold **Run history**, **Schedules** (active
schedules with pause/resume/run-now/delete, each showing whether Telegram delivers
it offline or it runs only while the app is open), and a **Scheduled inspector**
to review and clear Telegram's per-chat scheduled messages.

### Accounts

Login, validation, rename, logout, and deletion of local session copies.

### Import / Export

Batch-import many `.session` files at once (pick or drag-and-drop) — each is
validated and auto-named to its real Telegram account — and export selected
sessions as a ZIP backup.

### Activity

View the local JSONL audit trail and export it.

### Settings

Save Telegram API credentials and queue safety defaults.

## First-run setup

### Requirements

- Python 3.11+
- Node.js 20+
- a Telegram API ID and API hash from `https://my.telegram.org`

### Backend setup

Windows PowerShell / CMD:

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
run.bat
```

Git Bash / shell:

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install -r requirements.txt
./run.sh
```

Direct server command:

```bash
python -m uvicorn telemanager.main:app --app-dir src --reload
```

Open:

```text
http://127.0.0.1:8000
```

### Frontend build

The FastAPI app serves the React frontend from `apps/web/dist`.
Build it before starting the server:

```bash
npm install
npm run build
```

For frontend-only development:

```bash
npm run dev -- --filter web
```

## First-run checklist

1. Build the frontend with `npm run build`.
2. Start the backend with `run.bat`, `run.sh`, or `uvicorn`.
3. Open Settings.
4. Save your Telegram API ID and API hash.
5. Open Accounts.
6. Request a login code for an owned Telegram account.
7. Enter the code, and 2FA password if Telegram asks.
8. Validate the session.
9. Optionally fetch dialogs.
10. Build and preview a queue before running anything multi-account.

## Example workflows

### Add a fresh account

1. Open Settings and save Telegram API credentials.
2. Go to Accounts.
3. Enter a label and phone number in international format.
4. Request the login code.
5. Enter the Telegram code.
6. Enter 2FA password if needed.
7. Validate the saved session.

### Import an existing Telethon session

1. Go to Import / Export.
2. Upload a `.session` file.
3. Give it a local label.
4. Let TeleManager validate it when possible.

### Fetch dialogs and send them into Actions

1. Open Dialogs.
2. Select one account.
3. Fetch dialogs.
4. Search/filter as needed.
5. Select one or more dialogs.
6. Send them into the Actions builder or use a quick action.

### Run a guarded action queue

1. Open Actions.
2. Select the session(s) that should act.
3. Add one or more queue steps.
4. Preview the queue.
5. Review warnings, target count, and estimated time.
6. Confirm the queue.
7. Run it.
8. Review run history and exported results if needed.

## Data storage

TeleManager stores everything locally.

### Gitignored sensitive paths

- `data/`
- `sessions/`
- `*.session`

### Important files

- `data/config.json` — Telegram API ID and API hash
- `data/accounts.json` — account/session metadata
- `data/dialogs/{account_id}.json` — cached dialogs per account
- `data/action_presets.json` — saved queue presets
- `data/action_runs.json` — recent queue runs and statuses
- `data/schedules.json` — recurring schedules and their state
- `data/safety_settings.json` — default delays and operation caps
- `data/activity/events.jsonl` — local audit history
- `data/exports/` — generated ZIP exports
- `sessions/` — Telethon `.session` files

## Development commands

### Python

```bash
python -m pytest
```

### Frontend

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

### Local release package

```bash
python scripts/build-release.py --target local
```

This builds `release/telemanager-local.zip` on Windows or `release/telemanager-local.tar.gz` on Linux/macOS.
The packaged app starts a local server, opens `http://127.0.0.1:8000`, and stores local data next to the executable.

### Termux package

```bash
python scripts/build-release.py --termux
```

On Termux, unpack the archive and run:

```bash
./install-termux-alias.sh
telemanager
```

## Validation status

The current codebase has been validated with:

- `python -m pytest`
- `npm --prefix apps/web run lint`
- `npm --prefix apps/web run typecheck`
- `pi-lens` warnings cleared for the touched codebase state

## Project structure

```text
apps/web/              React frontend and UI primitives
src/telemanager/       FastAPI app and backend services
docs/                  Architecture, security, roadmap, and test docs
data/                  Local config, dialog cache, exports, activity logs; gitignored
sessions/              Telethon .session files; gitignored
AGENTS.md              Local-only agent instructions; gitignored
```

## Documentation

- `docs/ARCHITECTURE.md` — backend/frontend/data flow overview
- `docs/SECURITY.md` — local-only safety and sensitive-file guidance
- `docs/ROADMAP.md` — shipped work and likely next steps
- `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` — manual validation plan for real owned accounts

## Limitations

Current known boundaries:

- local-only by design
- no built-in authentication layer for remote exposure
- no HTTPS termination
- no multi-user access model
- queue cancellation is cooperative, not forceful mid-request interruption
- depends on operator discipline for ethical and policy-safe usage

## Repo summary

Short version:

> Local-first Telegram session manager for owned accounts, with safe queueing,
> dialog discovery, session import/export, and auditable one-off actions.

## License

Licensed under the [Apache License 2.0](LICENSE). © 2026 Mahyar.
