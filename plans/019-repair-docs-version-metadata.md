# Plan 019: Repair clean-clone setup, roadmap truth, and version metadata checks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- docs/DEVELOPMENT.md docs/ROADMAP.md AGENTS.md package.json package-lock.json apps/web/package.json apps/web/package-lock.json scripts/sync_version.py tests/test_version_sync.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx, docs
- **Planned at**: commit `5c26978`, 2026-07-16

## Why this matters

The development guide's frontend setup commands target the root package even
though the actual app and dependencies live under `apps/web`; a clean clone can
therefore appear installed while the frontend is not. The guide and roadmap
also claim a generated typed contract and an opt-in SQLite document backend
that are not present in the repository. Finally, release 1.16.0 updated the web
manifest but left both lockfile root-version fields and the root shim manifest
stale, while `sync_version.py --check` still reports success. This plan makes
the docs truthful and extends version drift checks to the package metadata the
repository actually tracks.

## Current state

- `docs/DEVELOPMENT.md:18-27` says:

```bash
# Frontend
npm install
npm run build
```

  but CI and `AGENTS.md` correctly use `npm --prefix apps/web ...`.

- `docs/DEVELOPMENT.md:38-42` documents `npm run dev -- --filter web`, although
  the root package is not a workspace and has no `--filter` setup.
- `docs/DEVELOPMENT.md:67` incorrectly says the sync script propagates to
  README; the script explicitly says README needs no propagation.
- `docs/DEVELOPMENT.md:109` says `documents.py` is a JSON-or-SQLite interface,
  but only `src/telemanager/store.py` exists and implements atomic JSON.
- `docs/ROADMAP.md:68-70` marks generated API types and opt-in SQLite storage as
  completed; no generator, OpenAPI artifact, SQLite store, or backend selector
  exists. `apps/web/src/lib/schemas.ts` is hand-maintained Zod.
- `docs/ROADMAP.md:71-72` contains stale exact test counts (26 frontend, 157
  backend); the current gates have 54 frontend and 241 backend tests. Prefer
  removing exact counts so the docs do not rot again.
- Canonical version is `1.16.0` in `pyproject.toml`, web manifest, and runtime.
  Stale metadata:
  - root `package.json:3` is `1.15.0`;
  - root `package-lock.json:3,9` is `1.8.0`;
  - `apps/web/package-lock.json:3,9` is `1.15.0`.
- `scripts/sync_version.py:4-16` deliberately ignores the root shim and
  lockfiles; its check compares only web manifest, runtime version, and Python
  requirements.
- CI calls `python scripts/sync_version.py --check`, so extending that script is
  enough to enforce the corrected metadata.

## Decision for this plan

- Keep the root package as a convenience script shim; do not convert the repo
  into npm workspaces.
- Treat root `package.json`, root lockfile root entry, web manifest, web lockfile
  root entry, runtime `__version__`, and Python requirements as derived from
  canonical project data where applicable.
- Do not run `npm install` merely to change lockfile root-version metadata; use
  deterministic JSON updates in the existing Python sync script.
- Correct docs to describe the current JSON `Document` implementation and
  hand-maintained Zod boundary. Do not implement the unshipped SQLite or schema
  generator features.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Sync apply | `python scripts/sync_version.py` | metadata synchronized |
| Sync check | `python scripts/sync_version.py --check` | exit 0, version 1.16.0 |
| Script tests | `PYTHONPATH=src python -m pytest -q tests/test_version_sync.py` | all pass |
| Backend full | `PYTHONPATH=src python -m pytest -q` | all pass |
| Python lint | `ruff check src tests scripts` | exit 0 |
| Frontend install check | `npm --prefix apps/web ci --ignore-scripts` | exit 0 |
| Frontend gates | `npm --prefix apps/web run lint && npm --prefix apps/web run typecheck && npm --prefix apps/web run test && npm --prefix apps/web run build` | all pass |

## Scope

**In scope**:

- `docs/DEVELOPMENT.md`
- `docs/ROADMAP.md`
- `AGENTS.md` only if wording must align with the corrected sync targets
- `package.json`
- `package-lock.json`
- `apps/web/package-lock.json`
- `scripts/sync_version.py`
- `tests/test_version_sync.py` (create)
- `plans/README.md`

**Out of scope**:

- Implementing SQLite storage or generated API schemas
- Converting to npm/pnpm/Turbo workspaces
- Changing frontend dependency versions
- Bumping the product version beyond 1.16.0
- Editing changelog or release notes
- Running a formatter over unrelated docs

## Git workflow

- Branch: `advisor/019-repair-docs-version-metadata`
- Commit: `docs(dev): align setup and version metadata with current repo`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Correct clean-clone frontend commands

In `docs/DEVELOPMENT.md`, replace root commands with the exact supported form:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run build
```

For dev server:

```bash
npm --prefix apps/web run dev
```

Clarify platform activation commands instead of presenting the Git Bash path as
universal:

- PowerShell: `.venv\Scripts\Activate.ps1`
- cmd.exe: `.venv\Scripts\activate.bat`
- Git Bash: `source .venv/Scripts/activate`
- POSIX: `source .venv/bin/activate`

Do not add a root-workspace setup.

### Step 2: Correct versioning and architecture prose

Update `docs/DEVELOPMENT.md`:

- State that `pyproject.toml` propagates to `apps/web/package.json`, tracked npm
  metadata, `src/telemanager/__init__.py`, and `requirements.txt`.
- Keep README described as a dynamic release badge requiring no version edit.
- Describe `documents.py` as process-wide shared `Document` instances and
  `store.py` as the atomic JSON store.
- Replace stale exact test count with “backend and frontend test suites.”

Update `docs/ROADMAP.md`:

- Remove or correct the completed SQLite-store claim. Preferred wording: JSON
  documents gained atomic writes and process-wide mutation locks; SQLite is not
  shipped.
- Remove or correct the generated-contract claim. Preferred wording: frontend
  validation uses Zod schemas; contract generation is not shipped.
- Remove exact test counts.
- Update the hardening priority about app password: it is shipped, but same-origin
  protection is supplied by Plan 015. If Plan 015 has not landed, describe it as
  pending rather than completed.

Do not alter the root product roadmap in `ROADMAP.md`; it is a separate current
feature plan.

### Step 3: Extend `sync_version.py` deterministically

Add paths for:

- root `package.json`,
- root `package-lock.json`,
- `apps/web/package-lock.json`.

Add small JSON helpers to read/update the root package version in each file. For
lockfiles update both:

- top-level `version`, and
- `packages[""]["version"]` when present.

Keep names, dependencies, lockfile versions, integrity hashes, and formatting
otherwise intact. Writing parsed JSON with the repository's existing two-space
format plus trailing newline is acceptable.

`--check` must report drift when any tracked field differs. The normal mode must
synchronize all of them. Update the module docstring and success/error output so
targets are not misleading.

Do not shell out to npm from this script.

**Verify**: run `python scripts/sync_version.py`; inspect `git diff` and confirm
only intended version fields changed in package JSON files.

### Step 4: Add isolated sync-script tests

Create `tests/test_version_sync.py`. Do not mutate repository manifests during
tests. Load the script module with `importlib`, monkeypatch its path constants to
a `tmp_path` fixture containing minimal representative TOML/JSON/text files,
and invoke helper functions or `main()` with patched `sys.argv`.

Required tests:

1. `--check` returns 1 when web lockfile root version drifts.
2. `--check` returns 1 when root manifest or root lockfile drifts.
3. Apply mode updates all manifest/lockfile root fields, runtime version, and
   requirements.
4. A subsequent `--check` returns 0.
5. Unrelated lockfile fields remain unchanged.

Use the current lockfile shapes as fixtures; no npm command in unit tests.

**Verify**:
`PYTHONPATH=src python -m pytest -q tests/test_version_sync.py`
→ all pass.

### Step 5: Validate lockfiles and frontend from a clean install

Run:

```bash
python scripts/sync_version.py --check
npm --prefix apps/web ci --ignore-scripts
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run test
npm --prefix apps/web run build
```

Expected: all exit 0. `npm ci` may rewrite `node_modules`, which is ignored; it
must not rewrite the lockfile. If the lockfile changes, inspect why and STOP if
changes are beyond root version metadata.

### Step 6: Run backend gates and inspect scope

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
python scripts/sync_version.py --check
git diff --check
git status --short
```

Expected: tests pass, Ruff clean, sync clean, no whitespace errors, and only
in-scope files plus the plan index are modified.

## Test plan

The five isolated tests in Step 4 are required. Manual verification is the clean
frontend install in Step 5 and a diff inspection proving no dependency graph or
integrity metadata was changed.

## Done criteria

- [ ] Clean-clone docs use `npm --prefix apps/web ci` and correct dev/build
      commands.
- [ ] Docs no longer claim unshipped SQLite or generated-contract features.
- [ ] Exact test counts are removed or current without becoming a maintenance
      burden.
- [ ] All manifest and lockfile root versions equal canonical 1.16.0.
- [ ] `sync_version.py --check` fails on future drift in any tracked version
      field.
- [ ] Isolated sync tests pass without touching repository metadata.
- [ ] Clean `npm ci` and all backend/frontend gates pass.
- [ ] No files outside scope are modified.
- [ ] Plan 019 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- Root package version is intentionally independent and a documented consumer
  relies on that independence.
- npm rewrites dependency/integrity sections after only version-field updates.
- A SQLite backend or schema generator appears on the execution branch, making
  the docs claim true.
- Testing the sync script would require modifying real repository manifests.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Future version-bearing files must be added to `sync_version.py --check` in the
same change that introduces them. Avoid exact test counts in long-lived docs;
CI is the source of truth for the current count.
