# Roadmap

TeleManager is now organized around stored Telegram sessions and guarded one-off workflows. Manual account start/stop is deprecated; validation, dialog fetches, and action queues connect only when needed and disconnect afterward.

## Completed

### Phase 1: Local Session Manager

- Save Telegram API ID and API hash locally.
- Log in accounts through phone code and optional 2FA password.
- Create local Telethon `.session` files.
- Keep newly logged-in accounts stopped by default.
- Import existing `.session` files.
- Export selected sessions as sensitive ZIP backups with redacted metadata.
- Rename account labels and local session filenames.
- Validate sessions and delete local session copies.

### Phase 2: App Shell and Dialog Discovery

- Sidebar app shell with Command Center, Accounts, Actions, Dialogs, Import / Export, Activity, and Settings.
- Dialog fetch and cache per account under `data/dialogs/{account_id}.json`.
- Dialog categorization for personal chats, bots, groups, supergroups, and channels.
- Dialog selection flow that copies selected targets into Actions.
- In-app confirmation/input modal replacing native browser prompts.

### Phase 3: Guarded Action Queues

- Build queues from many actions, many accounts, and many targets.
- Preview queues before running.
- Enforce explicit confirmation, conservative delays, and max operation limits.
- Run queues in the background with live polling.
- Persist queue run history under `data/action_runs.json`.
- Show per-operation statuses: `pending`, `running`, `ok`, `failed`, and `skipped_canceled`.
- Cancel queues cooperatively before the next operation starts.
- Save/load/delete local queue presets under `data/action_presets.json`.
- View, export, delete, clear, and retry failed queue runs.
- Store safety defaults under `data/safety_settings.json`.

### Phase 4: Documentation and Test Foundation

- Added real Telegram manual test checklist for owned sessions.
- Added pytest harness and API/service tests for queue validation, presets, run history, cancellation, dialogs, session file workflows, settings, and legacy route deprecation.
- Deprecated legacy start/stop routes with `410 Gone` guidance.

## Next Hardening Work

- Install dev dependencies and run the full pytest suite locally with `python -m pip install -e .[dev]` then `PYTHONPATH=src python -m pytest`.
- Add mocked Telethon tests for live dialog fetch, session validation, and Telegram action execution paths.
- Improve Telegram error taxonomy for flood waits, revoked sessions, invalid invites, unauthorized sessions, and network timeouts.
- Add optional local app password, CSRF protection, and stricter localhost-only enforcement before any non-local exposure.
- Consider encrypted local config/session storage for machines shared with other users.

## UX Polish

- Add account search, status filters, and optional tags/groups.
- Add dialog search improvements and target validation hints.
- Improve empty states and loading/disabled states across long-running operations.
- Improve mobile/narrow-screen layout for split panes, tables, modals, and run history.
- Add keyboard shortcuts only where they do not conflict with form input.

## Manual Validation

Use `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` with owned test accounts before relying on the app for important sessions. Do not commit checklist annotations containing private phone numbers, targets, API hashes, or session data.

## Deferred: Next.js + shadcn/ui

A framework migration should wait until the static FastAPI workflow is validated with real Telegram sessions and automated tests are passing. If pursued later, keep FastAPI as the local API backend and migrate the browser UI incrementally.
