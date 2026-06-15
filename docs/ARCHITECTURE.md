# Architecture

TeleManager is a local FastAPI application with a static browser UI. It manages Telegram user sessions locally and executes one-off Telegram actions by connecting to selected sessions only when needed.

## Runtime components

```text
Browser UI
  -> FastAPI routes in src/telemanager/main.py
    -> AccountManager in src/telemanager/accounts.py
    -> sessions_service.py
    -> dialogs_service.py
    -> audit_service.py
    -> telegram_actions.py
      -> Telethon TelegramClient
        -> local .session files in sessions/
```

## Backend

- `src/telemanager/main.py` exposes HTTP endpoints for configuration, safety settings, login, queue execution, run history, session import/export, account updates, and dialog fetch/list.
- `src/telemanager/accounts.py` owns account metadata, pending login challenges, session validation, and guarded action orchestration.
- `src/telemanager/telegram_actions.py` contains Telegram action implementations for joining, leaving, messaging, bot starts, dialog deletion, and chat clearing.
- `src/telemanager/sessions_service.py` contains local session import, export, rename, and delete operations.
- `src/telemanager/dialogs_service.py` fetches and classifies dialogs per account and stores local dialog caches.
- `src/telemanager/audit_service.py` writes persistent local activity events to JSONL.
- `src/telemanager/action_runs_service.py` persists recent queue runs and restores unfinished runs as interrupted after restart.
- `src/telemanager/presets_service.py` stores reusable local queue presets.
- `src/telemanager/config.py` stores local JSON files under `data/`, dialog caches under `data/dialogs/`, exports under `data/exports/`, and session files under `sessions/`.

## Frontend

- `src/telemanager/static/index.html` contains the app shell, sidebar navigation, and section views.
- `src/telemanager/static/styles.css` contains the dark local-ops dashboard visual system.
- `src/telemanager/static/app.js` implements client-side section navigation, account tables, action forms, dialog discovery UI, import/export UI, and local activity rendering.

## Data model

`data/accounts.json` stores account metadata such as label, phone, session name, source, validation timestamp, dialog count, status, and last error. It does not store Telegram login codes or 2FA passwords.

`data/config.json` stores the Telegram API ID and API hash locally.

`data/dialogs/{account_id}.json` stores cached dialog metadata for one account.

`data/exports/` stores generated ZIP exports.

`data/activity/events.jsonl` stores persistent local audit events.

`data/action_presets.json` stores reusable queue presets.

`data/action_runs.json` stores recent queue runs, operation statuses, results, cancellation state, and audit event IDs.

`data/safety_settings.json` stores default queue delays and max operation limits.

All `data/` and `sessions/` files are gitignored.

## Session lifecycle

1. User saves Telegram API credentials in Settings.
2. User logs in through Accounts or imports a `.session` file through Import / Export.
3. Telethon writes or validates the `.session` file.
4. The app disconnects immediately.
5. The account appears as a ready stored session.

The normal user workflow does not require manual start/stop.

## Action queue lifecycle

1. User selects sessions in the Actions page selector.
2. User adds one or more steps with an action, accounts, manual targets, or dialog-selected targets.
3. User previews the queue and reviews warnings, estimated duration, and operation count.
4. User confirms and starts the queue.
5. Backend expands steps into operations with `pending`, `running`, `ok`, `failed`, or `skipped_canceled` statuses.
6. Backend connects account-by-account, executes each one-off operation, stores results, and disconnects clients it opened.
7. UI polls queue state and renders live operation statuses.
8. Queue runs are persisted in `data/action_runs.json` and activity events are written to JSONL.

Cancellation is cooperative: a cancel request marks the run as canceling and the worker stops before the next operation. TeleManager does not forcibly interrupt an in-flight Telegram request.

Recent run management supports viewing, exporting, deleting terminal runs, clearing terminal history, and retrying failed operations as a new confirmed queue.

## Key API groups

- Configuration: `GET /api/config`, `POST /api/config`, `GET /api/settings/safety`, `POST /api/settings/safety`.
- Accounts: login, code/password confirmation, validation, rename, logout, and local delete routes.
- Legacy start/stop: old manual start/stop routes return `410 Gone` and point users to validate/dialog/action workflows.
- Sessions: import `.session`, export selected sessions, and rename local session files.
- Dialogs: fetch live dialogs for an account and read cached dialogs.
- Actions: preview one-off action, run one-off action, preview queue, run queue, cancel queue, list/view/export/delete/clear/retry queue runs, and manage presets.
- Activity: list and export local JSONL audit history.

## Dialog lifecycle

1. User opens Dialogs.
2. User selects one account.
3. Backend connects to that account session.
4. Backend calls Telethon `iter_dialogs()`.
5. Dialogs are classified into personal, bot, group, supergroup, channel, or unknown.
6. Cache is written to `data/dialogs/{account_id}.json`.
7. Account metadata is updated with dialog count and last fetch time.
8. Backend disconnects.

## Session import/export lifecycle

Import:

1. User uploads a `.session` file.
2. App copies it into `sessions/` with a safe generated filename.
3. App creates account metadata.
4. App validates the session when possible.

Export:

1. User selects sessions.
2. App creates a ZIP under `data/exports/` containing selected `.session` files, redacted metadata, and a security README.
3. Browser downloads the ZIP.

Session exports contain Telegram authentication material and must be kept private.
