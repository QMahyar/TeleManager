<!-- markdownlint-disable MD013 MD060 -->

# Plan 016: Serialize audit-log append, trim, read, and export operations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- src/telemanager/audit_service.py tests/test_audit.py tests/test_audit_trim.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, security
- **Planned at**: commit `5c26978`, 2026-07-16

## Why this matters

The activity JSONL is TeleManager's local security-of-record log. Sync FastAPI
routes, async queue finalizers, and the scheduler can all call `log_event`
concurrently. The current append and periodic whole-file trim have no shared
lock; on Windows, concurrent stress produces `PermissionError` during replace,
and on any platform a trim can race an append and lose an event. Audit logging
must be serialized so outward actions do not lose their record or fail after
succeeding remotely.

## Current state

- `src/telemanager/audit_service.py:10-15` defines the file and a global trim
  counter but no lock.
- `log_event` at lines 23-36 appends one line, then calls `_maybe_trim_events`.
- `_maybe_trim_events` at lines 39-57 mutates the global counter and can replace
  the entire file through `atomic_write_text`.
- `list_events` and `export_events_path` read or expose the file without
  coordination with trimming.
- `src/telemanager/action_queue_service.py:309-325` calls `log_event` in queue
  finalization before persisting the audit event ID. An audit filesystem error
  can therefore disrupt final run persistence.
- `tests/test_audit_trim.py` checks only single-threaded trim behavior.
- Persistence convention: use a process-wide `threading.Lock` for code reached
  from both FastAPI's thread pool and the event loop; `src/telemanager/store.py`
  documents and demonstrates this choice.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `PYTHONPATH=src python -m pytest -q tests/test_audit.py tests/test_audit_trim.py` | all pass |
| Full backend | `PYTHONPATH=src python -m pytest -q` | all pass |
| Lint | `ruff check src tests scripts` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/audit_service.py`
- `tests/test_audit_trim.py`
- `tests/test_audit.py` only if an existing assertion belongs there
- `plans/README.md`

**Out of scope**:

- Moving activity storage to SQLite
- Changing the JSONL event schema, retention count, or API response order
- Making audit logging best-effort or swallowing write errors
- Adding file locks for multiple TeleManager processes
- Changing queue/action audit payload contents

## Git workflow

- Branch: `advisor/016-serialize-audit-log`
- Commit: `fix(audit): serialize append and trim operations`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add one process-wide audit lock

In `audit_service.py`:

1. Import `threading`.
2. Add `_events_lock = threading.Lock()` next to the trim counter.
3. Treat `_appends_since_check` as protected by this lock.

Use a non-reentrant lock and structure helpers so code does not acquire it
recursively.

**Verify**: `ruff check src/telemanager/audit_service.py` → exit 0.

### Step 2: Put append and trim in one critical section

Refactor so each `log_event` call:

1. Creates the event outside or inside the lock (UUID/timestamp placement is
   not critical).
2. Acquires `_events_lock`.
3. Ensures the directory exists.
4. Appends and flushes/closes the line.
5. Increments the trim counter.
6. If due, reads and atomically rewrites the retained tail before releasing the
   lock.

Avoid calling a helper that reacquires `_events_lock`. Either make
`_maybe_trim_events_locked()` explicitly require the lock or inline the small
logic. Keep the existing atomic replacement for crash safety.

Do not catch and suppress write or replace failures: the bug is concurrency,
not whether disk-full should be ignored.

**Verify**: existing trim tests pass.

### Step 3: Coordinate readers and export-file creation

Wrap the snapshot read in `list_events` with `_events_lock`, then parse the
copied text after releasing the lock if convenient. Ensure
`export_events_path` creates an absent file under the same lock.

`FileResponse` streams after the function returns, so the lock cannot cover the
whole download. That is acceptable: the file is append-only between trims and
trim replacement is atomic. Do not hold a lock for the lifetime of a response.

**Verify**: `PYTHONPATH=src python -m pytest -q tests/test_audit.py` → pass.

### Step 4: Add deterministic concurrent regression coverage

In `tests/test_audit_trim.py`, add a test modeled after
`test_concurrent_mutate_does_not_lose_updates` in `tests/test_store.py`:

1. Monkeypatch small but practical values, e.g. `MAX_EVENTS = 200` and
   `_TRIM_CHECK_EVERY = 2`.
2. Reset `_appends_since_check` while no worker is active.
3. Start 8 threads, each writing 100 events with unique detail values.
4. Capture exceptions raised by workers; assert none.
5. Join every thread with a timeout and assert none remain alive.
6. Parse every retained line and assert valid JSON.
7. Assert the line count is bounded: at most `MAX_EVENTS +
   _TRIM_CHECK_EVERY - 1`, because events may arrive after the last trim
   threshold.
8. Assert no duplicate event IDs among retained events.

Do not assert that all 800 events remain—the retention policy intentionally
removes old events. The important properties are no exceptions, no malformed
lines, no duplicate retained IDs, and the documented bound.

Run the focused test repeatedly to expose flakiness:

```bash
for i in 1 2 3 4 5; do
  PYTHONPATH=src python -m pytest -q \
    tests/test_audit_trim.py::test_concurrent_logging_and_trim_are_serialized || exit 1
done
```

On PowerShell, run the equivalent test command five times manually.
Expected: five passes.

### Step 5: Run all backend gates

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
```

Expected: all pass.

## Test plan

- Existing bounded-retention test remains unchanged in meaning.
- New concurrent test covers append-versus-append and append-versus-trim.
- Existing queue-audit redaction test remains green.
- No timing sleeps are allowed in the new test; synchronization is by thread
  start/join only.

## Done criteria

- [ ] Append, trim-counter mutation, and trim replacement share one lock.
- [ ] Snapshot reads and absent-file creation coordinate with trim.
- [ ] Concurrent stress raises no filesystem exceptions and leaves valid JSONL.
- [ ] Retention remains bounded and newest-first API behavior is unchanged.
- [ ] No event schema or payload changes.
- [ ] Focused concurrent test passes five consecutive runs.
- [ ] Full backend tests and Ruff pass.
- [ ] No files outside scope are modified.
- [ ] Plan 016 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- Multiple TeleManager OS processes are now a supported deployment mode; a
  process-local lock would then be insufficient.
- Correctness appears to require holding a lock while `FileResponse` streams.
- The new concurrent test remains flaky after the lock is correctly scoped.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Any future audit compaction, rotation, or repair path must use the same lock.
The lock protects in-process concurrency only; if multi-process serving is ever
added, replace it with a storage design that provides cross-process atomicity.
