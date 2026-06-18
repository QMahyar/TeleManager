# Architecture

TeleManager is a local FastAPI application with a React frontend. It manages Telegram user sessions locally and executes one-off Telegram actions by connecting to selected sessions only when needed.

## Runtime components

```text
React Browser UI
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
- `src/telemanager/telegram_actions.py` contains Telegram action implementations, target validation rules, and Telegram-specific helper logic.
- `src/telemanager/sessions_service.py` contains local session import, export, rename, and delete operations.
- `src/telemanager/dialogs_service.py` fetches and classifies dialogs per account and stores local dialog caches.
- `src/telemanager/audit_service.py` writes persistent local activity events to JSONL.
- `src/telemanager/action_runs_service.py` persists recent queue runs and restores unfinished runs as interrupted after restart.
- `src/telemanager/presets_service.py` stores reusable local queue presets.
- `src/telemanager/config.py` stores local JSON files under `data/`, dialog caches under `data/dialogs/`, exports under `data/exports/`, and session files under `sessions/`.

## Frontend

- `apps/web` is the main React frontend.
- `apps/web/src/screens` contains the major application sections: command center, accounts, actions, dialogs, sessions, activity, and settings.
- `apps/web/src/components` contains the shared app shell, queue/run UI, account tables, dialog helpers, and reusable workspace pieces.
- `apps/web/src/hooks/use-app-state.ts` is the central client state coordinator for accounts, dialogs, queue builder state, presets, run history, and settings.
- `packages/ui` contains shared UI primitives and styles used by the React app.
- `src/telemanager/static` remains as a legacy fallback/parity reference, but the React frontend is the primary UI.

## Data model

`data/accounts.json` stores account metadata such as label, phone, session name, validation timestamp, dialog count, status, and last error. It does not store Telegram login codes or 2FA passwords.

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

The normal workflow does not require manual start/stop.

## Dialog lifecycle

1. User opens Dialogs.
2. User selects one account.
3. Backend connects to that account session.
4. Backend calls Telethon `iter_dialogs()`.
5. Dialogs are classified into personal, bot, group, supergroup, channel, or unknown.
6. Cache is written to `data/dialogs/{account_id}.json`.
7. Account metadata is updated with dialog count and last fetch time.
8. Backend disconnects.

The dialogs UI supports:

- filtering/search
- selecting many dialogs
- row-level quick actions
- bulk quick-action presets that hand off into the Actions builder

## Action queue lifecycle

1. User selects sessions in the Actions page selector.
2. User adds one or more steps with an action, accounts, manual targets, or dialog-selected targets.
3. User previews the queue and reviews warnings, estimated duration, and operation count.
4. User confirms and starts the queue.
5. Backend expands steps into operations with `pending`, `running`, `ok`, `failed`, or `skipped_canceled` statuses.
6. Backend connects account-by-account, executes each one-off operation, stores results, and disconnects clients it opened.
7. Per-account failures are tolerated so one missing dialog/target does not abort the full multi-account run.
8. UI polls queue state and renders live operation statuses.
9. Queue runs are persisted in `data/action_runs.json` and activity events are written to JSONL.

Cancellation is cooperative: a cancel request marks the run as canceling and the worker stops before the next operation. TeleManager does not forcibly interrupt an in-flight Telegram request.

Recent run management supports viewing, exporting, deleting terminal runs, clearing terminal history, and retrying failed operations as a new confirmed queue.

## Supported action families

- Membership: join, leave
- Messaging: send message, forward message, start bot
- Maintenance: delete dialog, clear history, archive/unarchive, mute/unmute, mark read
- Moderation: block/unblock user, report spam

Targets are validated per action type, and dialog quick actions prefill compatible actions for bots, personal chats, groups, supergroups, and channels.

## Key API groups

- Configuration: `GET /api/config`, `POST /api/config`, `GET /api/settings/safety`, `POST /api/settings/safety`
- Accounts: login, code/password confirmation, validation, rename, logout, and local delete routes
- Sessions: import `.session`, export selected sessions, and rename local session files
- Dialogs: fetch live dialogs for an account and read cached dialogs
- Actions: preview one-off action, run one-off action, preview queue, run queue, cancel queue, list/view/export/delete/clear/retry queue runs, and manage presets
- Activity: list and export local JSONL audit history

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
