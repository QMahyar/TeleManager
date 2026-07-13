# Plan 003: Cancellable inter-operation queue delay

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- src/telemanager/action_queue_service.py tests/test_queue_worker.py src/telemanager/telegram_actions.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

Queue cancel and pause are cooperative, but the **inter-operation pacing
delay** uses non-cancellable `safe_delay` (plain `asyncio.sleep` up to 120s).
Flood-wait auto-resume already uses `_cancellable_sleep`. An operator who
hits Cancel during a long sensitive-tier delay waits until the sleep ends
before the run stops — contradicting the "cancel before next operation"
promise for that window.

## Current state

### Worker loop (`src/telemanager/action_queue_service.py`)

Between operations:

```python
if index > 0:
    previous = expanded[index - 1]
    delay = inter_operation_delay(
        previous["account_id"], operation["account_id"], operation["action_type"], delays
    )
    await safe_delay(delay)
    # A cancel can land during the inter-op pause (up to 120s); honour it
    # here too so the queue stops promptly instead of running one more
    # operation. The op is still "pending", so it's marked skipped.
    if run.get("cancel_requested"):
        cancel_now(expanded[index:])
        break
```

`safe_delay` is imported from `telegram_actions` and is:

```python
async def safe_delay(seconds: float) -> None:
    await asyncio.sleep(max(0.0, min(seconds, MAX_ACTION_DELAY_SECONDS)))
```

### Already-correct pattern in the same file

```python
async def _cancellable_sleep(seconds: float, run: dict) -> bool:
    """Sleep up to `seconds`, re-checking the run's cancel flag every poll. Returns
    False the moment a cancel is seen, True if the full duration elapsed."""
    remaining = max(0.0, seconds)
    while remaining > 0:
        if run.get("cancel_requested"):
            return False
        step = min(CONTROL_POLL_SECONDS, remaining)
        await asyncio.sleep(step)
        remaining -= step
    return not run.get("cancel_requested")
```

`CONTROL_POLL_SECONDS = 1.0`.

Flood path uses it:

```python
if not await _cancellable_sleep(wait, run):
    raise _QueueAborted from exc
```

### Tests (`tests/test_queue_worker.py`)

- Monkeypatches `qs.safe_delay` to `async def no_delay(_seconds): return None`
  in several tests — after this change, those patches must target whatever
  the worker actually awaits (see steps).
- Pattern for cancel tests: set `cancel_requested` mid-flight; assert
  terminal status.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused | `python -m pytest -q tests/test_queue_worker.py` | all pass |
| Full | `python -m pytest -q` | all pass |
| Lint | `ruff check src tests` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/action_queue_service.py` — replace inter-op `safe_delay`
  with cancellable sleep; optional tiny helper if pause should also wake
  mid-delay (see step 1)
- `tests/test_queue_worker.py` — update monkeypatches + add one regression
  test

**Out of scope**:

- Changing `safe_delay` itself in `telegram_actions.py` (still used by
  schedules native send spacing, etc.)
- Making in-flight Telethon RPCs cancellable (explicitly cooperative by design)
- Pause mid-RPC

## Git workflow

- Branch: `advisor/003-cancellable-queue-delay`
- Commit: `fix(queue): honour cancel during inter-op delay`
- Do NOT push unless asked.

## Steps

### Step 1: Use `_cancellable_sleep` for inter-op delay

In `process_action_queue`, replace:

```python
await safe_delay(delay)
if run.get("cancel_requested"):
    cancel_now(expanded[index:])
    break
```

with:

```python
if not await _cancellable_sleep(delay, run):
    cancel_now(expanded[index:], during="during the inter-operation delay")
    break
```

Notes:

- `_cancellable_sleep` already re-checks `cancel_requested` every
  `CONTROL_POLL_SECONDS`.
- Keep the cancel_now path marking remaining ops `skipped_canceled` via
  `mark_remaining_operations` (existing helper).
- If `safe_delay` becomes unused in this module, remove it from the import
  list (ruff F401). Do **not** delete `telegram_actions.safe_delay`.

Optional (only if trivial): also break early when `pause_requested` is set
mid-delay by checking both flags in a local loop — **not required**. Prefer
YAGNI: cancel is the reported bug. Pause can wait until the next
`_wait_while_paused` at the top of the next iteration (at most ~poll
seconds after delay ends if you only fix cancel). If you do extend sleep to
watch pause, document it in the commit body.

**Verify**: `ruff check src/telemanager/action_queue_service.py` → exit 0.

### Step 2: Fix existing worker tests that patch `safe_delay`

Every test that does:

```python
monkeypatch.setattr(qs, "safe_delay", no_delay)
```

must still skip real wall-clock sleep. Options (pick one consistently):

- **A (preferred)**: monkeypatch `qs._cancellable_sleep` to
  `async def immediate(seconds, run): return not run.get("cancel_requested")`
  (or always `return True` when tests set cancel elsewhere).
- **B**: keep patching `safe_delay` only if step 1 still calls it (it should not).

Update **all** sites in `tests/test_queue_worker.py` that patch `safe_delay`
for the process loop.

**Verify**: `python -m pytest -q tests/test_queue_worker.py` → all pass.

### Step 3: New regression test

Add `test_cancel_during_inter_op_delay_stops_before_next_op` in
`tests/test_queue_worker.py`:

1. Two operations, same account.
2. First `run_warm_action` succeeds.
3. Patch `_cancellable_sleep` so that on the **first** call (inter-op delay)
   it sets `run["cancel_requested"] = True` and returns `False` (simulate
   cancel mid-delay). Do not sleep for real.
4. Assert:
   - run status `canceled`
   - second op is `skipped_canceled` (or whatever `mark_remaining_operations`
     sets — read that helper and assert the actual status string)
   - first op `ok`
   - `manager.is_account_busy("acc-1") is False`

Model structure after `test_cancel_during_final_op_ends_canceled` in the
same file.

**Verify**:
`python -m pytest -q tests/test_queue_worker.py::test_cancel_during_inter_op_delay_stops_before_next_op`
→ pass.

### Step 4: Full suite

```bash
python -m pytest -q
ruff check src tests
```

## Test plan

- New test in step 3.
- Existing worker tests remain green after monkeypatch retarget.
- Pattern: `tests/test_queue_worker.py`.

## Done criteria

- [ ] Inter-op path does not call `safe_delay` (grep
      `safe_delay` in `action_queue_service.py` → only import removed or unused)
- [ ] New cancel-during-delay test passes
- [ ] `python -m pytest -q tests/test_queue_worker.py` passes
- [ ] Full `python -m pytest -q` passes
- [ ] `ruff check src tests` exit 0
- [ ] No out-of-scope files modified
- [ ] `plans/README.md` row 003 → DONE

## STOP conditions

- `process_action_queue` structure no longer matches (rewrite already
  cancelled differently).
- Changing this appears to require making Telethon calls cancellable.
- Verification fails twice.

## Maintenance notes

- Any new sleep in the queue worker should use `_cancellable_sleep` or
  explicitly document why not.
- Reviewer: confirm cancel during delay does not mark the **next** op as
  `failed` / `running`.
