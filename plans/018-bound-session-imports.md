<!-- markdownlint-disable MD013 MD060 -->

# Plan 018: Bound session import batch size and streamed file bytes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- src/telemanager/sessions_service.py src/telemanager/routes/accounts.py tests/test_dialogs_sessions.py docs/SECURITY.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: Plan 017 (same service; execute sequentially to avoid conflicts)
- **Category**: security, perf
- **Planned at**: commit `5c26978`, 2026-07-16

## Why this matters

`POST /api/sessions/import-files` accepts any number of multipart files and
copies each upload to disk without counting bytes. A mistaken selection or
local hostile request can consume arbitrary disk and keep the async endpoint
busy with synchronous copying. Session files are small SQLite databases; a
conservative explicit cap protects local resources without changing the normal
workflow.

## Current state

- `src/telemanager/routes/accounts.py:162-177` checks only that the list is
  non-empty.
- `src/telemanager/sessions_service.py:45-62` validates the filename suffix,
  then uses unbounded `shutil.copyfileobj(upload.file, output)` directly into the
  final destination.
- `import_session_files` at lines 90-101 processes files sequentially and
  records per-file `ValueError` failures without aborting the whole batch.
- `src/telemanager/account_settings_service.py:305-315` is the local precedent
  for a 10 MB uploaded image cap, though it receives bytes already materialized.
- `tests/test_dialogs_sessions.py:153-163` covers only rejection by extension.

## Limits chosen for this plan

- **Maximum files per request**: 25.
- **Maximum bytes per `.session` file**: 32 MiB (`32 * 1024 * 1024`).
- **Copy chunk size**: 1 MiB or smaller.

These limits are intentionally generous for Telethon SQLite sessions while
bounding disk and work. Define named module constants so they can be reviewed
and changed centrally. Do not use `Content-Length` as the enforcement boundary;
it may be absent or inaccurate.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `PYTHONPATH=src python -m pytest -q tests/test_dialogs_sessions.py` | all pass |
| Full backend | `PYTHONPATH=src python -m pytest -q` | all pass |
| Lint | `ruff check src tests scripts` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/sessions_service.py`
- `src/telemanager/routes/accounts.py`
- `tests/test_dialogs_sessions.py`
- `docs/SECURITY.md` for the documented import limits
- `plans/README.md`

**Out of scope**:

- Inspecting or sanitizing the SQLite schema beyond existing validation
- MIME-type enforcement; browser MIME values are not authoritative
- Parallel imports
- Global request-body middleware
- Profile-photo upload behavior
- Session export atomicity (Plan 017)
- Frontend redesign or client-side-only limits

## Git workflow

- Branch: `advisor/018-bound-session-imports`
- Commit: `fix(sessions): bound imported session files`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Enforce the batch-count limit at the route boundary

In `routes/accounts.py`, after the existing empty-list check:

- Compare `len(files)` with `MAX_SESSION_IMPORT_FILES`, imported from
  `sessions_service.py`.
- Return HTTP 400 with a readable message that includes the maximum count.
- Reject the whole request before calling `import_session_files`; no files or
  account records may be created.

Do not add the limit only in the frontend.

**Verify**: add a route test posting 26 tiny `.session` parts; assert 400 and no
accounts imported.

### Step 2: Replace unbounded copy with counted streaming

In `sessions_service.py`:

1. Add named constants for the file and chunk limits.
2. Add a small synchronous helper that reads `upload.file` in chunks and writes
   to an already-open output while tracking total bytes.
3. Read at most `remaining + 1` when near the limit so rejection happens as soon
   as the cap is crossed; never load the entire upload into memory.
4. Reject zero-byte files as invalid.
5. Raise `ValueError` with a stable operator-facing message when oversized.

Use binary file methods from the standard library; do not add a dependency.

**Verify**: unit tests can monkeypatch the constants to small values so test
payloads remain tiny.

### Step 3: Guarantee cleanup and account-state atomicity

Wrap destination creation/copy so any copy, limit, or filesystem exception
removes the partial destination. The account must not be inserted into
`manager.accounts` until the complete file has been copied successfully.

Rules:

- On `ValueError`, `import_session_files` retains its per-file failure behavior.
- On an oversized file, later files in a valid-size batch continue importing.
- On unexpected filesystem exceptions, clean the partial file and let the
  exception propagate to the generic handler; do not mislabel disk failure as
  user input.
- Ensure `UploadFile.file` does not need to be rewound after rejection.

**Verify**: an oversized first file plus valid second file yields one failure,
one imported account, and no partial file for the failed item.

### Step 4: Add the regression matrix

Extend `tests/test_dialogs_sessions.py`:

1. Exactly 25 valid extension parts reaches the service; monkeypatch validation
   to avoid real Telethon and keep the test fast.
2. 26 parts returns 400 before any destination is created.
3. Exactly the byte cap is accepted.
4. Cap plus one byte is rejected.
5. Zero bytes is rejected.
6. Oversized failure leaves no partial session and no account record.
7. Mixed batch continues after one oversized file.
8. Existing non-`.session` behavior remains a per-file failure.

Prefer monkeypatching `MAX_SESSION_IMPORT_BYTES` to a small value in tests; do
not allocate a 32 MiB fixture unless needed for an integration boundary check.
Never use real session bytes.

**Verify**:
`PYTHONPATH=src python -m pytest -q tests/test_dialogs_sessions.py`
→ all pass.

### Step 5: Document the limits

Add a short note to `docs/SECURITY.md` under Session Risk or a new Session
Import subsection: at most 25 files per request and 32 MiB per file, enforced
while streaming. Do not imply that size checks make untrusted session databases
safe; imported sessions remain sensitive and are validated through existing
Telethon behavior.

### Step 6: Run all backend gates

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
```

Expected: all pass.

## Test plan

All eight cases in Step 4 are required. Follow `app_context` isolation and never
read or write repository-local runtime data.

## Done criteria

- [ ] Requests over 25 files fail before service work begins.
- [ ] Each file is streamed with a hard 32 MiB cap and bounded memory.
- [ ] Zero-byte and oversized files produce per-file failures.
- [ ] Rejected or interrupted copies leave no destination or account record.
- [ ] A mixed batch continues processing valid later files.
- [ ] Limits are documented.
- [ ] Full backend tests and Ruff pass.
- [ ] No files outside scope are modified.
- [ ] Plan 018 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- Real supported Telethon session files in project documentation or fixtures can
  exceed 32 MiB.
- Starlette has already consumed/closed the upload stream before the service.
- Cleanup requires deleting an existing destination rather than the newly
  generated unique path.
- Implementing the cap appears to require buffering the entire upload.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Keep limits server-side even if the frontend later adds friendlier early
validation. Any new upload endpoint should use streamed byte enforcement or a
framework-level limit appropriate to its data type.
