# Roadmap

TeleManager is organized around stored Telegram sessions and guarded one-off workflows. Manual account start/stop is deprecated; validation, dialog fetches, and action queues connect only when needed and disconnect afterward.

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
- Save, load, delete local queue presets under `data/action_presets.json`.
- View, export, delete, clear, and retry failed queue runs.
- Store safety defaults under `data/safety_settings.json`.

### Phase 4: React Frontend Consolidation and UX Polish

- Promote the React frontend in `apps/web` to the primary interface.
- Add consistent empty states, accessibility labels, searchable command palette, and better shell behavior.
- Improve account login/challenge flow, sessions export visibility, activity rendering, queue/run detail UX, and actions/dialougs handoff polish.
- Add action-aware target validation and richer queue builder guidance.

### Phase 5: Dialog-to-Action Workflow

- Add row-level dialog quick actions and bulk selected-dialog quick actions.
- Prefill the Actions page from dialog context with visible handoff metadata.
- Keep selected dialog targets scoped to the currently loaded dialog set.
- Keep dialog account selection valid after account refreshes.
- Tolerate per-account queue failures so missing dialogs or unavailable targets do not abort multi-account runs.

### Phase 6: Recurring Schedules

- Turn any built queue into a recurring schedule (interval + end after N times / on a date / never).
- Auto-select a delivery engine per schedule: Telegram-native scheduled messages for text-only schedules (deliver while the app is closed), or the in-app queue runner for everything else.
- Keep a rolling per-chat buffer within Telegram's 100-message / 365-day limits for native schedules, refilled while the app runs.
- Background `SchedulerService` task started/stopped with the app lifespan; skip slots missed while closed instead of replaying bursts.
- Preview, pause/resume, run-now, and delete schedules; deleting a native schedule removes the messages it pre-scheduled.
- Persist schedules under `data/schedules.json`; tag queue runs created by a schedule with `schedule_id`.

### Phase 7: Hardening and performance (v1.11.0–v1.14.0)

- **Action-aware pacing.** Replaced flat inter-operation delay with tier-based cooldowns from a single `ACTION_META` registry: instant (maintenance reads), standard (joins/leaves), sensitive (sends/forwards). Each tier keeps its own jitter window.
- **UI overhaul.** Flat hierarchy app-wide — panels are the containers, content lives on rhythm. Type system moved to Geist + Geist Mono (self-hosted), with a unified `type-*` scale in `globals.css` as the single source of truth.
- **Dialog profile photos.** Optional per-account thumbnail download riding the existing rate-limited dialog fetch. Cached under `data/avatars/`, toggled globally via `data/app_settings.json` (new) with per-account override.
- **Typed API contract.** Shared TypeScript types generated from backend schemas eliminate the hand-maintained duplication between FastAPI and React.
- **React-query migration.** Resource and run polling moved to `@tanstack/react-query`; client state simplified by removing bespoke polling loops.
- **SQLite store (opt-in).** `Document` interface backed by either JSON files (default) or a single SQLite database, switchable without API changes.
- **Frontend decomposition.** The three 1000+ line screens (`actions`, `dialogs`, `accounts`) broken into focused components; 26 Vitest tests added.
- **Backend test suite.** Backend split so irreversible Telegram-action paths are fully testable without a live client; 157 tests passing, CI gates on lint + typecheck + test.
- **Security fix and CI hardening.** Addressed a localhost-exposure issue; CI now blocks merges on any failed check.

## Current hardening priorities

- Improve Telegram error taxonomy for flood waits, revoked sessions, invalid invites, unauthorized sessions, and network timeouts.
- Add mocked Telethon tests for live dialog fetch and session validation paths (Telegram-action paths covered as of v1.14.0).
- Add optional local app password and CSRF protection before any non-local exposure.
- Consider encrypted local config/session storage for machines shared with other users.

## Manual validation

Use `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` with owned test accounts before relying on the app for important sessions. Do not commit checklist annotations containing private phone numbers, targets, API hashes, or session data.

## Release verification

Recommended verification commands:

```bash
npx tsc --noEmit -p apps/web/tsconfig.app.json
cd apps/web && npx vite build
python -m py_compile E:/Code/TeleManager/src/telemanager/main.py E:/Code/TeleManager/src/telemanager/telegram_actions.py E:/Code/TeleManager/src/telemanager/accounts.py
```

For Python tests when the local environment has the dependencies installed:

```bash
PYTHONPATH=src python -m pytest -q
```
