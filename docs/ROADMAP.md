# Roadmap

TeleManager is now organized around stored Telegram sessions and guarded
one-off workflows. Manual account start/stop is deprecated; validation,
dialog fetches, and action queues connect only when needed and disconnect
afterward.

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

- Sidebar app shell with Command Center, Accounts, Actions, Dialogs,
  Import / Export, Activity, and Settings.
- Dialog fetch and cache per account under `data/dialogs/{account_id}.json`.
- Dialog categorization for personal chats, bots, groups, supergroups, and
  channels.
- Dialog selection flow that copies selected targets into Actions.
- In-app confirmation/input modal replacing native browser prompts.

### Phase 3: Guarded Action Queues

- Build queues from many actions, many accounts, and many targets.
- Preview queues before running.
- Enforce explicit confirmation, conservative delays, and max operation limits.
- Run queues in the background with live polling.
- Persist queue run history under `data/action_runs.json`.
- Show per-operation statuses: `pending`, `running`, `ok`, `failed`, and
  `skipped_canceled`.
- Cancel queues cooperatively before the next operation starts.
- Save/load/delete local queue presets under `data/action_presets.json`.
- View, export, delete, clear, and retry failed queue runs.
- Store safety defaults under `data/safety_settings.json`.

### Phase 4: Documentation and Test Foundation

- Added real Telegram manual test checklist for owned sessions.
- Added pytest harness and API/service tests for queue validation, presets,
  run history, cancellation, dialogs, session file workflows, settings, and
  legacy route deprecation.
- Deprecated legacy start/stop routes with `410 Gone` guidance.

## Next Hardening Work

- Dev dependencies are installed in the current agent environment and the
  current suite passes with `PYTHONPATH=src python -m pytest`.
- Add mocked Telethon tests for live dialog fetch, session validation, and
  Telegram action execution paths.
- Improve Telegram error taxonomy for flood waits, revoked sessions, invalid
  invites, unauthorized sessions, and network timeouts.
- Add optional local app password, CSRF protection, and stricter localhost-only
  enforcement before any non-local exposure.
- Consider encrypted local config/session storage for machines shared with
  other users.

## UX Polish

- Add account search, status filters, and optional tags/groups.
- Add dialog search improvements and target validation hints.
- Improve empty states and loading/disabled states across long-running
  operations.
- Improve mobile/narrow-screen layout for split panes, tables, modals, and run
  history.
- Add keyboard shortcuts only where they do not conflict with form input.

## Manual Validation

Use `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` with owned test accounts before
relying on the app for important sessions. Do not commit checklist annotations
containing private phone numbers, targets, API hashes, or session data.

## Session Handoff

Status at handoff:

- Branch: `main`.
- Last pushed commit before this handoff work:
  `37a3f0e Build guarded queue workflow`.
- Part 1 is complete: `pytest`/`httpx` dev dependencies are available in the
  agent environment and `PYTHONPATH=src python -m pytest -q` reports
  `18 passed`.
- Pi-lens false-positive for `pytest` in `tests/conftest.py` was handled with
  `# pyright: reportMissingImports=false` because runtime pytest import
  succeeds.
- Validation command to rerun:

  ```bash
  PYTHONPATH=src python -m pytest -q
  PYTHONPATH=src python -m compileall -q src tests
  node --check src/telemanager/static/app.js
  ```

- Real Telegram testing has not been performed by the agent because it requires
  private local API credentials and owned `.session` files.
- Use `docs/REAL_TELEGRAM_TEST_CHECKLIST.md` for the next manual pass.
- Do not commit `data/`, `sessions/`, `.session`, `.env*`, real target lists,
  or local checklist notes containing private data.

Recommended next steps for the next agent:

1. Run the full validation command above and check `git status`.
2. Perform or guide the real Telegram checklist with owned accounts.
3. Add mocked Telethon tests for validation, dialog fetch, action execution,
   and Telegram error cases.
4. Continue hardening with better Telegram error taxonomy and optional local
   auth/CSRF.
5. Polish UX with account filters, loading states, mobile layout, and clearer
   empty states.
6. Revisit `docs/NEXTJS_MIGRATION_PLAN.md` only after the static app is
   validated with real sessions.

## Deferred: Next.js + shadcn/ui

A framework migration should wait until the static FastAPI workflow is
validated with real Telegram sessions and automated tests are passing. If
pursued later, keep FastAPI as the local API backend and migrate the browser UI
incrementally.
