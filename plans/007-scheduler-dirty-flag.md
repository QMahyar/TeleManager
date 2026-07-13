# Plan 007: Scheduler only rewrites schedules.json when state changes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- src/telemanager/schedules_service.py tests/test_schedules.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

`SchedulerService._tick_locked` sets `dirty = True` for **every active**
schedule on every tick, even when `_tick_runner` returns early because
`now < next_fire` (no mutation). That rewrites `data/schedules.json` on a
timer for idle schedules — unnecessary disk IO and noisier file watchers /
backups.

## Current state

### `_tick_locked` (`src/telemanager/schedules_service.py`)

```python
async def _tick_locked(self) -> datetime:
    now = utcnow()
    schedules = load_schedules()
    soonest = now + timedelta(seconds=MAX_SLEEP_SECONDS)
    dirty = False
    for schedule in schedules.values():
        if schedule.get("status") != "active":
            continue
        try:
            if schedule.get("engine") == "native":
                wake = await self._tick_native(schedule, now)
            else:
                wake = await self._tick_runner(schedule, now)
            schedule["last_error"] = schedule.get("last_error")
        except Exception as exc:
            ...
            wake = now + timedelta(minutes=5)
        dirty = True
        if wake and wake < soonest:
            soonest = wake
    if dirty:
        save_schedules(schedules)
    return soonest
```

Note the no-op line `schedule["last_error"] = schedule.get("last_error")`
(does not change data but sits next to the always-true dirty flag).

### `_tick_runner` early exit (no mutation)

```python
if now < next_fire:
    return next_fire
```

Fires and completions **do** mutate `next_fire_at`, `fires_done`,
`last_fire_at`, `status`, `last_error`, `run_ids`, etc.

### `_tick_native`

Often mutates `fires_done`, `next_fire_at`, `updated_at`, and on reconcile
`native_chats`, `last_reconcile_at`, warnings. When deferred/busy it may still
touch fields — read the function before assuming a tick is clean.

### Persistence

`save_schedules` goes through the schedules document (atomic JSON write).
Tests in `tests/test_schedules.py` exercise create/pause/fire/reconcile but
do not assert write frequency.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused | `python -m pytest -q tests/test_schedules.py` | all pass |
| Full | `python -m pytest -q` | all pass |
| Lint | `ruff check src tests` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/schedules_service.py` — dirty detection in `_tick_locked`
  and/or return values from `_tick_runner` / `_tick_native`
- `tests/test_schedules.py` — one test that idle ticks do not call
  `save_schedules` (via monkeypatch counter)

**Out of scope**:

- Redesigning schedule storage format
- Changing fire semantics, skip-missed-slots behaviour, or native reconcile
  intervals
- SQLite migration

## Git workflow

- Branch: `advisor/007-scheduler-dirty-flag`
- Commit: `perf(schedules): skip schedules.json write on idle ticks`
- Do NOT push unless asked.

## Steps

### Step 1: Choose a dirty strategy (implement one)

**Option A — snapshot before/after (robust, slightly heavier):**

```python
import copy
...
before = copy.deepcopy(schedule)  # or json-roundtrip for plain dicts
wake = await self._tick_runner(...)
if schedule != before:
    dirty = True
```

Dict equality works if values are JSON-plain (they are). Deepcopy cost is
fine at schedule counts this app will have (tens, not millions).

**Option B — return `(wake, changed: bool)` from `_tick_runner` /
`_tick_native`:** more precise, more churn. Only pick this if Option A is
awkward.

Also:

- Set `dirty = True` on the exception path (status/error mutation).
- Remove the useless `schedule["last_error"] = schedule.get("last_error")`
  line unless it was papering over something — it is a no-op.
- Idle active schedules still contribute to `soonest` via returned `wake`
  **without** requiring a save.

**Verify**: `ruff check src/telemanager/schedules_service.py` → exit 0.

### Step 2: Test idle tick does not save

In `tests/test_schedules.py`, add something like:

```python
def test_idle_tick_does_not_rewrite_schedules(app_context, monkeypatch):
    # Create an active runner schedule with next_fire_at in the future
    # (reuse helpers/patterns from test_create_list_pause_resume_delete_schedule)
    service = app_context["main"].scheduler
    saves = {"n": 0}
    import telemanager.schedules_service as ss
    real_save = ss.save_schedules
    def counting_save(data):
        saves["n"] += 1
        return real_save(data)
    monkeypatch.setattr(ss, "save_schedules", counting_save)
    # Also patch service module binding if save_schedules was imported by name
    # into the class module namespace — patch where _tick_locked looks it up.

    before = saves["n"]
    asyncio.run(service.tick())  # or _tick_locked
    assert saves["n"] == before  # no write
```

Patch path caveat: `_tick_locked` calls `save_schedules` as a global in
`schedules_service.py` — monkeypatch
`telemanager.schedules_service.save_schedules`.

Ensure the schedule is truly idle (`now < next_fire`, engine runner). Read
existing create helpers in the same test file and reuse them.

Also assert a **firing** tick still saves (second test or same test with
time travel): set `next_fire_at` in the past, tick once, `saves["n"]` increases.

**Verify**:
`python -m pytest -q tests/test_schedules.py -k idle_tick` → pass.

### Step 3: Full suite

```bash
python -m pytest -q
ruff check src tests
```

Confirm existing schedule tests still pass (create/pause/native reconcile).

## Test plan

- Idle no-save + fire-does-save coverage (step 2).
- Pattern: `tests/test_schedules.py` monkeypatch style (see busy-fire test).

## Done criteria

- [ ] Idle active schedules no longer force `save_schedules` every tick
- [ ] Mutations (fire, complete, error, native reconcile changes) still save
- [ ] New test(s) pass; full `tests/test_schedules.py` passes
- [ ] `python -m pytest -q` passes; ruff clean
- [ ] `plans/README.md` row 007 → DONE

## STOP conditions

- `_tick_native` always mutates timestamps even when "idle" in a way that
  makes Option A always dirty — then either accept dirty only when
  reconcile ran, or return an explicit `changed` flag from `_tick_native`
  (still in scope if required for correctness).
- Fix would change fire timing / skip-missed behaviour.
- Verification fails twice.

## Maintenance notes

- Any new field written every tick "for freshness" reintroduces the bug —
  avoid `updated_at = now` on pure idle paths.
- Reviewer: confirm `soonest` wake calculation still works when `dirty` is
  false so the loop sleep timeout remains correct.
