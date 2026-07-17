<!-- markdownlint-disable MD013 MD060 -->

# Plan 014: Make native schedule deletion recoverable and truthful

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- src/telemanager/schedules_service.py src/telemanager/routes/schedules.py tests/test_schedules.py apps/web/src/lib/schemas.ts apps/web/src/types.ts apps/web/src/components/schedule-parts.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, tech-debt
- **Planned at**: commit `5c26978`, 2026-07-16

## Why this matters

A native schedule pre-creates messages on Telegram so they can send while
TeleManager is closed. Deleting such a schedule currently removes the only
local record of those Telegram message IDs before cleanup runs. Cleanup errors
are swallowed and the API still returns success, so messages can continue
sending after the operator was told the schedule was deleted. Deletion must
retain retryable local state until every tracked native message has either been
deleted or is known to be absent.

## Current state

- `src/telemanager/schedules_service.py:426-449` removes persistence before
  Telegram cleanup:

```python
async def delete(self, schedule_id: str) -> None:
    async with self._lock:
        schedules = load_schedules()
        schedule = schedules.get(schedule_id)
        if not schedule:
            raise KeyError(schedule_id)
        schedules.pop(schedule_id, None)
        save_schedules(schedules)
    try:
        await self.teardown_native(schedule)
    except Exception:
        logger.exception("Native teardown failed for deleted schedule %s", schedule_id)
    log_event("schedule_deleted", ...)
```

- `teardown_native` at `src/telemanager/schedules_service.py:838-867` holds the
  account session guard, iterates tracked `native_chats[*].ids`, and clears an
  entry after `delete_scheduled_messages` succeeds. `_warm()` can return `None`,
  leaving IDs untouched without raising.
- `tests/test_schedules.py:102-133` verifies only that the local record is gone.
- `apps/web/src/lib/schemas.ts:115` currently permits schedule statuses
  `active`, `paused`, `completed`, `canceled`, and `error`.
- The UI confirmation in `apps/web/src/components/schedule-parts.tsx` promises
  that deletion removes the schedule and its pre-scheduled Telegram messages.
- Domain constraint from `AGENTS.md`: outward Telegram actions must remain
  guarded, auditable, and account-session locking must not be weakened.

## Decision for this plan

Use a persisted deletion tombstone, represented by schedule status
`deleting`, until native cleanup succeeds. This is simpler and safer than a
new document or queue:

1. Under the scheduler lock, set `status = "deleting"`, record a concise
   `last_error`/timestamp as appropriate, and save.
2. Outside the scheduler lock, run `teardown_native` under the existing account
   session guard.
3. Reacquire the scheduler lock and remove the record only if no tracked native
   IDs remain.
4. If cleanup raises or leaves tracked IDs (for example `_warm` returned
   `None`), retain the tombstone and return a failure so the operator is not
   told deletion succeeded.
5. A later DELETE request retries cleanup. Scheduler ticks must not fire
   `deleting` records because only `active` records are processed already.

Do not build an autonomous retry daemon in this plan. Explicit retry by DELETE
and persistence across restart are sufficient.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused backend | `PYTHONPATH=src python -m pytest -q tests/test_schedules.py tests/test_scheduled_overview.py` | all pass |
| Backend full | `PYTHONPATH=src python -m pytest -q` | all pass |
| Backend lint | `ruff check src tests scripts` | exit 0 |
| Frontend typecheck | `npm --prefix apps/web run typecheck` | exit 0 |
| Frontend tests | `npm --prefix apps/web run test` | all pass |
| Frontend build | `npm --prefix apps/web run build` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/schedules_service.py`
- `src/telemanager/routes/schedules.py`
- `tests/test_schedules.py`
- `apps/web/src/lib/schemas.ts` only if `deleting` can reach API responses
- `apps/web/src/types.ts` only if a manual status union exists there
- `apps/web/src/components/schedule-parts.tsx` only for minimal status/retry copy
- `plans/README.md`

**Out of scope**:

- Changing recurrence or firing semantics
- Replacing `session_guard` or allowing concurrent use of a `.session` file
- A general durable background-job framework
- Automatically deleting untracked Telegram scheduled messages
- Changing the scheduled inspector's manual clear behavior
- Redesigning the schedules screen

## Git workflow

- Branch: `advisor/014-recoverable-native-schedule-deletion`
- Commit: `fix(schedules): retain native cleanup state until deletion succeeds`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add pure helpers for cleanup completeness

In `schedules_service.py`, add a small helper that determines whether a native
schedule still has tracked IDs. It should inspect `native_chats` defensively and
return `True` only when a non-empty `ids` mapping remains. Keep it pure so tests
can cover old/malformed records.

Example contract:

```python
def has_tracked_native_ids(schedule: dict[str, Any]) -> bool:
    ...
```

Do not infer cleanup from account authorization or schedule engine alone.

**Verify**: `ruff check src/telemanager/schedules_service.py` → exit 0.

### Step 2: Persist a deletion tombstone before touching Telegram

Rewrite `SchedulerService.delete` so that:

- Missing schedule still raises `KeyError`.
- Runner schedules, or native schedules with no tracked IDs, can be removed
  immediately and audited as deleted.
- Native schedules with tracked IDs are saved with `status = "deleting"`
  before the method releases `self._lock`.
- Preserve the queue and `native_chats` fields; they are the recovery data.
- A second DELETE for a `deleting` schedule proceeds as a retry rather than
  returning 404.

Do not hold `self._lock` during Telethon calls.

**Verify**: focused schedule tests still pass before adding new tests.

### Step 3: Make teardown report incomplete cleanup

Adjust `teardown_native` to provide an explicit success signal or raise a
readable `ValueError` when tracked IDs remain after the attempt. In particular,
`_warm(account_id, warmed) is None` must not be treated as successful cleanup.

Rules:

- Keep `session_guard(account_ids)` and `release_run_clients` in `finally`.
- Clear each entry's IDs only after its Telegram delete call succeeds.
- If one entry fails, do not erase other unattempted IDs.
- Do not include message text, phone numbers, API credentials, or raw session
  paths in persisted errors or audit payloads.

**Verify**: add a unit test where `_warm` returns `None`; IDs remain and cleanup
is reported incomplete.

### Step 4: Remove the tombstone only after verified cleanup

After teardown returns:

- Reacquire `self._lock`.
- Reload schedules from disk instead of trusting the stale pre-await mapping.
- Find the same schedule ID. If it was removed through an unexpected concurrent
  path, STOP rather than silently re-create it.
- If tracked IDs remain, save `status = "deleting"` plus a concise
  `last_error`, then raise `ValueError`.
- If none remain, remove the schedule, save, emit `schedule_deleted`, and notify.

On any teardown exception:

- Log the traceback server-side.
- Persist the tombstone and a safe `last_error`.
- Raise `ValueError` from `delete`; do not emit `schedule_deleted` and do not
  return success.

`routes/schedules.py::delete_schedule` must translate this `ValueError` into a
400 or 409 with an actionable message such as “Telegram cleanup did not finish;
retry deletion when the account is available.” Match existing route error
handling.

**Verify**: focused tests for both success and failure pass.

### Step 5: Update the frontend status contract minimally

If retained tombstones appear in `GET /api/schedules`, add `deleting` to the
Zod status enum. Render it as non-active and provide a retry-delete action using
the existing delete control. Change confirmation/error copy only as needed to
avoid claiming deletion succeeded when the API failed.

Do not add new screens, polling mechanisms, or a general recovery center.

**Verify**:

```bash
npm --prefix apps/web run typecheck
npm --prefix apps/web run test
npm --prefix apps/web run build
```

All exit 0.

### Step 6: Add the complete regression matrix

In `tests/test_schedules.py`, add tests modeled after
`test_create_list_pause_resume_delete_schedule` and existing monkeypatched
Telethon helpers:

1. Runner schedule deletion removes immediately.
2. Native schedule with tracked IDs: successful fake Telegram deletion clears
   IDs and removes the local record.
3. Telegram deletion raises: API is non-2xx, local record remains with
   `status == "deleting"`, and IDs remain.
4. `_warm` returns `None`: same retained tombstone behavior.
5. A second DELETE after the dependency recovers retries and finally removes
   the tombstone.
6. Reloading schedules from disk retains `deleting` records and scheduler tick
   does not fire them.
7. `schedule_deleted` audit event exists only after final success.

No test may open a real Telegram connection.

**Verify**:
`PYTHONPATH=src python -m pytest -q tests/test_schedules.py tests/test_scheduled_overview.py`
→ all pass.

### Step 7: Run all gates

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run test
npm --prefix apps/web run build
```

All pass.

## Test plan

The seven cases in Step 6 are required. Reuse the local fake-client and
`monkeypatch` patterns already present in `tests/test_schedules.py`; do not
introduce network tests or sleeping retries.

## Done criteria

- [ ] A native schedule is not removed locally until every tracked message ID
      has been cleaned up.
- [ ] Failed or incomplete cleanup produces a non-2xx API response and retains
      retryable state across reload.
- [ ] Repeating DELETE retries a tombstone.
- [ ] Runner schedules retain simple immediate deletion.
- [ ] No `schedule_deleted` audit event is emitted before cleanup succeeds.
- [ ] Scheduler ticks ignore `deleting` records.
- [ ] Backend and frontend full gates pass.
- [ ] No files outside scope are modified.
- [ ] Plan 014 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- Telegram's delete API cannot safely be retried for the tracked IDs.
- Correctness requires holding `self._lock` during network calls.
- Current schedule storage no longer preserves `native_chats[*].ids`.
- The UI/API has an exhaustive status contract beyond the listed files.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Future native delivery types must persist enough identity to undo what they
pre-create. Reviewers should treat “best effort after deleting local state” as
invalid for any feature whose remote effect can continue after TeleManager
closes.
