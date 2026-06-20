# Changelog

All notable changes to TeleManager are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The canonical version lives in [`pyproject.toml`](pyproject.toml); run
`python scripts/sync_version.py` after bumping it to propagate the version.
The GitHub release body for a tag is extracted from the matching `## [VERSION]`
section below, with auto-generated commit/PR notes appended.

## [Unreleased]

### Added

- **Standalone schedule builder** on the Schedules page: create a recurring schedule end-to-end (accounts, action, target chats, message, recurrence) without going through the Actions queue builder.
- **Start options** for schedules: begin after one interval, after a delay (e.g. +1h), or at a specific time.
- **Cross-chat stagger** toggle so identical messages to multiple chats don't all fire at the same instant.
- **Fully-offline indicator** in the schedule preview when the entire series fits Telegram's 100-per-chat buffer (pre-scheduled all at once, no reopen needed).
- **Scheduled-message inspector**: pick an account + chat to list what Telegram actually has scheduled (marking TeleManager-created vs manual messages) and clear selected or all — `GET/POST /api/accounts/{id}/scheduled`.

### Changed

- Workspace navigation reordered to Dialogs → Actions → Schedules.
- Scheduling moved out of the Actions screen into the dedicated Schedules page.
- **Account selection now flows between screens**: Command Center "Run Action" / "Fetch Dialogs" carry the selected ready sessions into Actions / Dialogs, and every Dialogs → Actions handoff pre-selects the dialog's account so the builder no longer blocks on "select an account".
- Activity audit log is now capped (most recent 5,000 events) instead of growing without bound.

### Fixed

- `fetch_messages` / `resolve_target` now check authorization live (via a shared short-lived client) instead of trusting a possibly-stale flag, so revoked sessions return a clear message.
- Target-preview warnings render in amber instead of error-red.

### Internal

- Run history shows a "scheduled" badge on runs started by a schedule.
- Deduplicated target classification (one shared `analyzeTarget`), folded dialog reads onto a single `temp_client` helper, centralized `now_iso`, and removed dead code (`audit_service.get_event`).

## [1.3.0] - 2026-06-20

### Added

- **Recurring schedules**: turn any built action queue into a repeating schedule (every N minutes/hours/days, ending after a set number of times, on a date, or never).
- **Automatic delivery engine** per schedule: text-only schedules (plain messages and a plain `/start`) are pre-loaded as Telegram-native scheduled messages and keep firing while TeleManager is closed; all other actions run via the in-app queue runner while the app is open.
- **Rolling native buffer** that respects Telegram's 100-scheduled-messages-per-chat (365-day) limit and refills whenever the app is running.
- New **Schedules** screen and a "Schedule this queue" path in the Actions builder, with preview, pause/resume, run-now, and delete (deleting a native schedule also removes the messages it pre-scheduled).
- Background `SchedulerService` started/stopped with the app lifespan; queue runs created by a schedule are tagged with `schedule_id`.
- **`/api/schedules`** endpoints (preview, create, list, get, patch, run-now, delete) and a new `data/schedules.json` store.

## [1.2.0] - 2026-06-19

### Added

- **About page** with version display, update checker (compares against GitHub latest release), author socials, and crypto donation addresses. Accessible from the sidebar under System.
- **`GET /api/version`** endpoint exposing the running version.
- **`GET /api/updates/check`** endpoint that fetches the latest GitHub release and performs semver comparison from the server side (avoiding browser CORS/rate-limit issues).
- Version single-sourcing now includes `src/telemanager/__init__.py` (`__version__`) as a synced derived file alongside `package.json` and `README.md`.
- GitHub Release title now explicitly set to `TeleManager vX.Y.Z` instead of just the tag name.

## [1.1.0] - 2026-06-19

### Added

- 15 Telegram action operations with target validation and a guarded multi-account queue workflow.
- Dialog quick actions and tolerant multi-account execution.
- Bot referral links and redesigned frontend UX.
- Local PyInstaller packaging for Windows/Linux/macOS (amd64 + arm64) and a Termux arm64 source package.
- Single-source versioning (`pyproject.toml` → `package.json`/README via `scripts/sync_version.py`).

### Fixed

- Release build and Telethon connection handling.
- Windowed (console-less) build crash: `Unable to configure formatter 'default'` caused by `sys.stdout`/`sys.stderr` being `None` under PyInstaller `console=False`.
- Termux package failing to import `telemanager` (package under `src/` was not on `PYTHONPATH`).

### Changed

- Simplified app structure; removed legacy static UI in favor of the React/Vite SPA.
- End-to-end UI polish across shell, accounts, sessions, dialogs, and run history.
- Build script auto-skips the pip reinstall when PyInstaller is already on PATH.

## [1.0.0] - 2026-06-18

### Added

- Initial TeleManager app: local Telethon `.session` creation, validation, import/export, and audit trail.
- React frontend (Vite, Tailwind) served as a FastAPI SPA.
- Guarded one-off action queues with conservative rate limiting and a local audit trail.
