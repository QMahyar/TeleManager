# TeleManager — Full Improvement Plan ("do them all")

> Working tracker for the end-to-end hardening + refactor effort. Mirrors the approved
> plan and is updated in place as phases land. Status reflects the branch as of the last
> edit; the marker on each item is the source of truth, not the prose around it.

**Status legend:** ✅ done · 🟡 in progress · ⬜ not started

**Current snapshot**
- Backend suite: **151 passing** (`py -3.12 -m pytest -q`); `ruff check src tests` clean.
- Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phases 4–9 ⬜
- Phases 0–3 committed on `improvements/full-sweep` (off `main`).

---

## Context

A deep review (security, backend architecture, frontend architecture, tests/tooling)
found TeleManager to be well-built but carrying structural debt in four areas: one real
security gap (no origin/host protection on a no-auth localhost API), a persistence model
that is atomic per-write but not per-transaction, three 1000+ line screen files, and a
test suite that covers happy paths but not the irreversible Telegram-action paths.

Scope is **all** review items — quick wins, medium tier, and the three "big swings"
(SQLite store, react-query, typed API contract) — plus introducing frontend tests (Vitest).

**Sequencing principle:** foundations first, so the big swings *replace internals behind a
stable interface* instead of discarding earlier work:
- Phase 2 introduces a `Store`/`Document` interface (JSON+lock) → Phase 9 swaps in SQLite behind it.
- Phase 4 splits state into domain hooks → Phase 8 puts react-query inside those hooks.
- Phase 7 adds Zod boundary validation → optional codegen kills drift permanently.

Each phase is independently shippable. Respect project conventions: bump
`pyproject.toml` version + run `scripts/sync_version.py`, update `CHANGELOG.md` before any
tag, and keep styling in the token layer (`ui/globals.css`, `components/ui.tsx`, `ui/*`).

Two review claims were verified-and-downgraded: JSON writes are already atomic (no torn
files — the risk is *lost updates*), and returning `phone` to the local UI is by-design
(the rebinding fix closes the only leak vector). The plan reflects the corrected severities.

---

## Phase 0 — Quick wins: security + CI ✅

- [x] **Host-header allowlist** — `TrustedHostMiddleware` added in `main.py` reading
  `TELEMANAGER_ALLOWED_HOSTS` (defaults `127.0.0.1,localhost,::1`). Closes the
  DNS-rebinding hole against the no-auth localhost API. *(Was zero middleware before.)*
- [x] **Atomic audit trim** — extracted `atomic_write_text()` into `config.py`;
  `audit_service.py` trim now writes through it (temp + `replace`) instead of a bare
  `write_text`. `write_json` refactored to reuse the same helper.
- [x] **CI frontend gate** — `.github/workflows/ci.yml` gains a `web` job
  ("Frontend lint, typecheck, build") on Node 20: `npm ci` → `lint` → `typecheck` →
  `build`. *(Vitest `test` step intentionally deferred to Phase 6.)*
- [x] **Release test gate** — `release.yml` gains a `test` job (backend `pytest -q`); the
  `frontend` job now `needs: [version-sync, test]`, so artifacts can't publish on red.
- [x] **Test-harness compat** — `TestClient(base_url="http://127.0.0.1")` in `conftest.py`
  + `test_settings_and_legacy.py` so the new host guard doesn't reject the suite.
- [x] **New tests** — `tests/test_security.py` (foreign Host → 400; allowed host → 200;
  `localhost:8000` port-stripped → accepted).

## Phase 1 — Backend hardening ✅

- [x] **Explicit account serialization** — added `AccountRecord.to_public_dict()`
  enumerating all 16 public fields; replaced all 9 `account.__dict__` returns in `main.py`.
  New internal fields can no longer leak silently.
- [x] **Queue op timeout** — `process_action_queue` wraps each action in
  `asyncio.wait_for(..., QUEUE_OPERATION_TIMEOUT_SECONDS=180)`; a `TimeoutError` fails just
  that op (logged) and the run continues instead of stalling the whole queue.
- [x] **Action input validation** — `send_media` raises `ValueError` if the media file is
  missing (checked before any client use).
- [x] **Traceback logging** — `logging` wired into the queue service; outer failure path
  now `logger.exception(...)`; per-op timeout warns with run/action/account context.
- [x] **New tests** — `tests/test_backend_hardening.py` (`to_public_dict` doesn't leak an
  injected attribute but does keep `phone`; `send_media` rejects a missing file).

## Phase 2 — Persistence unification (foundation for SQLite) ✅

- [x] **`src/telemanager/store.py`** — `Document` abstraction per JSON file:
  `threading.Lock` (not `asyncio.Lock`, since persistence is touched from both the anyio
  threadpool and the event loop) guarding `read` / `write` / `mutate()` (RMW context
  manager) / `update()` (functional). Storage-agnostic surface so Phase 9 SQLite backs it
  unchanged.
- [x] **`tests/test_store.py`** — `mutate` persists in-place edits; `mutate` writes nothing
  on exception; 20 threads × 25 increments = 500 with no lost updates.
- [x] **`src/telemanager/documents.py`** — process-wide `Document` singletons, one per file
  (one lock per file). Services import the shared instance instead of constructing their
  own, so every writer of a file serializes through the same gate. `config_doc` is shared
  between `set_config` (write) and the account manager (reads). This is the single seam
  Phase 9 swaps for SQLite.
- [x] **Migrated read-modify-write call-sites.** Genuine *unguarded* RMW → `mutate()`:
  `presets_service.py` (upsert/delete) and `main.py` `set_config` (config merge — a missing
  hash raises inside `mutate()`, so nothing persists). Already-serialized or snapshot writes
  → routed through `read`/`write` for unification: `schedules_service.py` (under the
  scheduler's `asyncio.Lock`), `accounts.py` (`_load`/`_save`, fleet held in memory under
  `self.lock`), `app_settings.py` + safety settings (full-replace writes).
- [x] **`queue_runs` persistence via `runs_doc`.** `load_action_runs`/`save_action_runs`
  now write through the shared `Document`, giving the run dict a single locked, atomic write
  gate. *(Chose this over a full `RunsStore` signature refactor across `main.py`/scheduler —
  same persistence-integrity guarantee, far lower blast radius. The in-memory dict stays
  shared by reference as before.)*
- [x] **`tests/test_persistence_migration.py`** — 16 concurrent `save_action_preset` calls
  all survive (proves the `mutate()` wiring, not just the class); delete-missing raises and
  writes nothing; `set_config` merges over the stored hash instead of wiping it.

## Phase 3 — Backend refactor + irreversible-path tests ✅

- [x] **Split `main.py` (739 → ~90 lines)** into `routes/` APIRouter modules (static,
  config, settings, accounts+sessions, dialogs, actions, schedules, activity, system) wired
  via `app.include_router(...)`. Shared live state (`manager`/`queue_runs`/`scheduler`) moved
  to `runtime.py`; `main` re-exports test-facing names via `__all__`. All 50 API routes
  verified registered (listed `app.routes`); only `test_file_picker`'s monkeypatch target
  moved with `pick_path` into `routes.system`.
- [x] **Extracted `recurrence.py` + `timeutil.py`** — pure fire-time math and UTC helpers,
  re-exported from `schedules_service` so `ss.<name>` callers/tests are unchanged. Breaks
  the would-be circular import.
- [x] **High-value tests**:
  - `test_queue_worker.py` — run continues after a single ok=False op (only FloodWait
    breaks); **regression guard**: a crashing run releases session locks (`is_account_busy`
    False). *(Cancel-during-inter-op-delay already covered by existing cancellation tests.)*
  - `test_recurrence.py` (13) — past anchor skips elapsed slots; zero-length window empty;
    runaway interval caps at limit; count/until bounds; native_horizon clamps.
  - `test_persistence_migration.py` *(Phase 2)* concurrent saves don't lose updates;
    `test_audit_trim.py` — trim bounds the JSONL and keeps every line valid JSON (atomic).

## Phase 4 — Frontend state split (foundation for react-query) ⬜

Extract the domain hooks already defined inside `hooks/use-app-state.ts` into their own
files, keeping `useAppState` a thin aggregator (screens untouched):
- [ ] `use-view-state.ts`, `use-account-state.ts`, `use-dialog-state.ts`,
  `use-resource-state.ts` (owns the 10s activity + 5s schedules polls), `use-queue-state.ts`,
  `use-run-polling.ts`, `use-version.ts`.

## Phase 5 — Frontend screen decomposition + perf ⬜

- [ ] **dialogs-screen.tsx (~1540)** → source/table/messages panels +
  `use-dialogs-controller.ts` + `use-cached-dialogs.ts`.
- [ ] **accounts-screen.tsx (~1220)** → `fleet-tab` / `login-tab` (+ `use-account-login-flow.ts`)
  / `transfer-tab`.
- [ ] **actions-screen.tsx (~1059)** → `actions-builder` / `actions-queue` /
  `actions-run-banner` (+ `use-action-busy.ts`).
- [ ] **Perf** — `React.memo(DialogRow)` + `useCallback` row handlers (search re-renders all
  rows today); `react-window` only if lists routinely exceed a few hundred.
- [ ] **Dedupe resolver** — move `dialogTarget`/`dialogKind` into `lib/dialog-resolver.ts`,
  document field priority, converge backend to emit one canonical `target` field.

## Phase 6 — Frontend tests (Vitest) ⬜

- [ ] devDeps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`;
  `vitest.config.ts` reusing the React plugin + `@/*` alias; `"test": "vitest run"`; wire
  into the CI `web` job (the step deferred in Phase 0).
- [ ] Cover logic-heavy units: `lib/dialog-resolver.ts`, `lib/targeting.ts`,
  `lib/scheduling.ts`, queue-builder validation, recurrence UI in `schedule-parts.tsx`.

## Phase 7 — Big swing: typed API contract ⬜

- [ ] Zod schemas for the ~20 response shapes; validate inside `lib/api.ts`'s `api<T>()` at
  the boundary (replaces the unchecked `as T`).
- [ ] Optional drift-killer: generate types/schemas from FastAPI `/openapi.json`.

## Phase 8 — Big swing: react-query ⬜

- [ ] Add `@tanstack/react-query`; replace hand-rolled polling + manual fetches inside
  `use-resource-state.ts` / `use-run-polling.ts` with queries/mutations. Keep each hook's
  public shape stable so screens barely change.

## Phase 9 — Big swing: SQLite store ⬜

- [ ] SQLite-backed store behind the Phase 2 `Document` interface; one-time migration of
  `data/*.json`. Transactions replace the lock dance; indexed queries give free pagination.

---

## Verification

Run after each phase; full sweep before any release tag.

**Backend**
- `py -3.12 -m pytest -q` (per project memory: use `py -3.12`, `PYTHONPATH=src`; bare
  `python` is the wrong venv).
- `ruff check src tests scripts`.
- Host-header guard: `curl -H "Host: evil.com" http://127.0.0.1:8000/api/version` rejected;
  `Host: 127.0.0.1:8000` passes.

**Frontend**
- `npm --prefix apps/web run lint && npm --prefix apps/web run typecheck && npm --prefix apps/web run build`.
- `npm --prefix apps/web run test` (from Phase 6).

**End-to-end (manual)**
- `npm --prefix apps/web run build`, then `py -3.12 -m uvicorn telemanager.main:app --app-dir src`
  → http://127.0.0.1:8000. Smoke: load accounts, fetch dialogs, build + run a small guarded
  queue (watch run polling), create/inspect a schedule, confirm audit entries. Behavior must
  be unchanged across refactor phases (4–5) and big swings (7–9).

**Version/release**
- `python scripts/sync_version.py --check` stays green; update `CHANGELOG.md` `## [X.Y.Z]`
  before tagging. These changes span multiple releases — bump per shippable phase.
