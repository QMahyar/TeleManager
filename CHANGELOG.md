# Changelog

All notable changes to TeleManager are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The canonical version lives in [`pyproject.toml`](pyproject.toml); run
`python scripts/sync_version.py` after bumping it to propagate the version.
The GitHub release body for a tag is extracted from the matching `## [VERSION]`
section below, with auto-generated commit/PR notes appended.

## [Unreleased]

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
