# AGENTS.md

TeleManager — a **local-first** manager for owned Telegram accounts. A FastAPI
backend wraps Telethon `.session` files; a React app is the operator console for
sessions, dialog discovery, guarded action queues, schedules, and a local audit log.

## Non-negotiables

- **Local only.** Server binds `127.0.0.1`; no auth layer, no HTTPS, no multi-user.
  Don't expose it remotely without adding those first.
- **Never commit** `data/`, `sessions/`, `*.session`, `.env`, API IDs/hashes, phone
  numbers, or local operator notes (all gitignored — keep it that way).
- **Guarded actions only.** Bulk Telegram actions must stay queued, rate-limited,
  auditable, and confirmed before execution.
- **No abuse features.** No spam, scams, impersonation, unsolicited messaging, or
  ban/limit evasion.

## Layout

- `src/telemanager/` — FastAPI app + backend services (Telethon, schedules, audit).
- `apps/web/` — React + Vite + Tailwind v4 frontend; FastAPI serves `apps/web/dist`.
- `scripts/` — release + version tooling. `docs/` — architecture, security, roadmap, development guide.
- `data/`, `sessions/` — local runtime state, gitignored.

## Commands

```bash
# Backend (dev)
python -m uvicorn telemanager.main:app --app-dir src --reload   # serves http://127.0.0.1:8000

# Frontend
npm --prefix apps/web run dev        # dev server (proxies /api to :8000)
npm --prefix apps/web run build      # build -> apps/web/dist (required before backend serves UI)
npm --prefix apps/web run lint       # eslint
npm --prefix apps/web run typecheck  # tsc --noEmit

# Backend tests / lint
python -m pytest
ruff check src
```

## Conventions

- **Versioning is single-source.** `pyproject.toml` is canonical for both the
  `[project] version` and the runtime dependency pins; run
  `python scripts/sync_version.py` to propagate the version to `apps/web/package.json`
  and `src/telemanager/__init__.py`, and to regenerate `requirements.txt` from
  `[project] dependencies` (CI gate: `--check`). README shows the version via a
  dynamic release badge, so it needs no propagation.
- **Releases are tag-driven.** Push a `vX.Y.Z` tag → `.github/workflows/release.yml`
  builds all platforms and publishes a GitHub release whose body is the matching
  `## [X.Y.Z]` section of `CHANGELOG.md`. Update the CHANGELOG before tagging.
- **Frontend theme** ("Console"): dark-first, warm-charcoal neutrals + dim-teal accent,
  Geist Mono for machine data, Geist for prose (both self-hosted). Keep type restrained.
  Design lives in the token layer (`src/ui/globals.css`) and shared primitives
  (`src/components/ui.tsx`) — restyle there, not per-screen.
