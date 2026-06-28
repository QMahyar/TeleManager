# Development Guide

> **User-facing overview:** [README.md](../README.md)

TeleManager is a FastAPI backend (Python, Telethon) with a React + Vite + Tailwind v4 frontend. The backend serves the built frontend from `apps/web/dist`.

For architecture, data model, and lifecycle flows see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Requirements

- Python 3.11+
- Node.js 20+

## Setup

```bash
# Python environment
python -m venv .venv
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
npm install
npm run build
```

## Running locally

```bash
# Backend with hot reload
python -m uvicorn telemanager.main:app --app-dir src --reload

# Or use the platform script:
run.bat        # Windows
./run.sh       # Linux / macOS / Termux
```

Frontend dev server (proxies `/api` to `:8000`, no backend required for UI work):

```bash
npm run dev -- --filter web
```

---

## Tests and lint

```bash
# Backend
PYTHONPATH=src python -m pytest
ruff check src

# Frontend
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

CI gates on all four checks. Nothing merges with a failing lint, typecheck, test, or build.

---

## Versioning

`pyproject.toml` `[project] version` is the single source of truth. After bumping it, propagate to `apps/web/package.json`, `README.md`, and `src/telemanager/__init__.py`:

```bash
python scripts/sync_version.py          # apply
python scripts/sync_version.py --check  # dry-run (used in CI)
```

---

## Release flow

1. Add a `## [X.Y.Z]` section to `CHANGELOG.md`.
2. Bump version in `pyproject.toml`.
3. Run `python scripts/sync_version.py`.
4. Commit and push.
5. Push a `vX.Y.Z` tag → `.github/workflows/release.yml` builds all platforms and publishes a GitHub release whose body is pulled from the matching CHANGELOG section.

To build locally:

```bash
python scripts/build-release.py --target local   # Windows / Linux package
python scripts/build-release.py --termux         # Termux ARM64 tarball
```

Output lands in `release/`.

---

## Project structure

```
src/telemanager/        FastAPI app and backend services
  main.py               HTTP endpoint definitions
  accounts.py           Account metadata, login, validation, orchestration
  telegram_actions.py   Telegram action implementations and target validation
  sessions_service.py   Import, export, rename, delete .session files
  dialogs_service.py    Live dialog fetch, classification, and local cache
  schedules_service.py  Recurring schedule engine (native + runner modes)
  action_runs_service.py  Queue run persistence and interrupted-run recovery
  audit_service.py      JSONL activity log writer
  app_settings.py       App-level display preferences (dialog photos toggle)
  presets_service.py    Reusable queue preset storage
  documents.py          Document interface (JSON or SQLite backend)
  config.py             Data directory paths

apps/web/               React + Vite + Tailwind v4 frontend
  src/screens/          Major application sections
  src/components/       Shared shell, queue/run UI, account and dialog helpers
  src/hooks/            Central client state (accounts, dialogs, queue, settings)
  src/ui/               UI primitives, tokens, and globals.css

tests/                  Backend test suite (pytest, 157+ tests)
scripts/                sync_version.py, build-release.py, gen-assets.mjs
docs/                   ARCHITECTURE.md, SECURITY.md, ROADMAP.md, this file
.github/workflows/      ci.yml (lint+test+typecheck), release.yml (tag-driven build)
```

---

## Frontend theme

**Console** — dark-first, warm-charcoal neutrals, dim-teal accent. Geist + Geist Mono (self-hosted). All design tokens live in `apps/web/src/ui/globals.css`; shared primitives in `apps/web/src/components/ui.tsx`. Restyle at the token/primitive layer, not per-screen.

---

## Conventions

See [AGENTS.md](../AGENTS.md) for the full project conventions checklist (non-negotiables, gitignored paths, commit style, CI gates).
