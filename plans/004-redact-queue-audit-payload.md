# Plan 004: Redact message text from queue audit events

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- src/telemanager/action_queue_service.py src/telemanager/audit_service.py tests/test_audit.py tests/test_queue_worker.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

When a queue finishes, `process_action_queue` writes an activity event whose
payload includes `request.model_dump()` — the full queue request, including
every step's `message` field (message text, media paths, bot start payloads).
That lands in `data/activity/events.jsonl` (kept up to 5000 events).

Run history in `data/action_runs.json` already retains operational detail for
the operator UI; the audit trail does not need a second full copy of message
bodies. Reducing PII/secret-adjacent content in the always-on JSONL lowers
leak impact if activity is shared or backed up carelessly.

## Current state

### Writer (`src/telemanager/action_queue_service.py` finally block)

```python
event = log_event(
    "telegram_action_queue",
    "Telegram action queue completed",
    f"{run['ok_count']}/{len(run['results'])} operations succeeded",
    {"request": request.model_dump(), "results": run["results"], "error": run["error"]},
)
run["audit_event_id"] = event["id"]
```

`ActionQueueStep` includes `message: str | None` (max 4096).
`run["results"]` is a list of per-op result dicts (`ok`, `detail`, `target`,
etc.) — details are usually short status strings, not full outbound message
bodies, but may echo Telegram error text.

### Audit API (`src/telemanager/audit_service.py`)

```python
def log_event(event_type: str, title: str, detail: str = "", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    ...
    event = { ..., "payload": payload or {}, }
    # append JSON line to events.jsonl
```

No redaction layer today. Other callers already pass small payloads
(account_id only, etc.).

### Tests

- `tests/test_audit.py` — cap/trim only.
- Queue worker tests do not assert audit payload contents.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused | `python -m pytest -q tests/test_audit.py tests/test_queue_worker.py` | all pass |
| Full | `python -m pytest -q` | all pass |
| Lint | `ruff check src tests` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/action_queue_service.py` — build a redacted audit payload
  before `log_event`
- Optionally a tiny pure helper in the same file (or `audit_service.py` if
  you prefer a shared name like `redact_queue_audit_payload`) — keep it
  **local** unless a second caller needs it
- `tests/test_audit.py` or `tests/test_queue_worker.py` — one unit/integration
  assertion

**Out of scope**:

- Scrubbing historical `events.jsonl` on disk
- Changing `action_runs.json` persistence (UI still needs run detail)
- Global `log_event` filtering of all event types
- Encrypting activity files

## Git workflow

- Branch: `advisor/004-redact-queue-audit-payload`
- Commit: `fix(audit): omit message bodies from queue completion events`
- Do NOT push unless asked.

## Steps

### Step 1: Build a redacted request snapshot

Before `log_event` in `process_action_queue`'s `finally`:

1. Start from `request.model_dump()`.
2. For each step in `request["steps"]` (or the dump's `steps`):
   - If `message` is present and non-empty, replace with a boolean or length
     marker — pick **one** stable shape and use it everywhere:
     - Preferred: `"message": null` and `"message_present": true`, **or**
     - Simpler YAGNI: delete `message` key and set
       `"has_message": bool(original)`.
3. Do **not** drop `action_type`, `account_ids`, `targets`, delays,
   `max_operations`, `confirm` — operators still need to see what ran at a
   high level.
4. For `results`: keep as today **unless** a result field clearly duplicates
   full message text (unlikely). Do not invent deep scrubbing.

Example target call shape:

```python
event = log_event(
    "telegram_action_queue",
    "Telegram action queue completed",
    f"{run['ok_count']}/{len(run['results'])} operations succeeded",
    {
        "request": _audit_queue_request(request),
        "results": run["results"],
        "error": run["error"],
    },
)
```

Implement `_audit_queue_request(request: ActionQueueRequest) -> dict` as a
module-level pure function next to the other helpers in
`action_queue_service.py`.

**Verify**: `ruff check src/telemanager/action_queue_service.py` → exit 0.

### Step 2: Unit test the pure helper

In `tests/test_audit.py` (or a small new test in `tests/test_queue_worker.py`):

```python
def test_audit_queue_request_strips_message_bodies():
    from telemanager.action_queue_service import ActionQueueRequest, ActionQueueStep, _audit_queue_request
    req = ActionQueueRequest(
        steps=[
            ActionQueueStep(
                action_type="send_message",
                account_ids=["acc-1"],
                targets=["@x"],
                message="super secret outbound text",
            )
        ],
        confirm=True,
    )
    dumped = _audit_queue_request(req)
    step = dumped["steps"][0]
    assert "super secret outbound text" not in json.dumps(dumped)
    assert step.get("has_message") is True or step.get("message_present") is True
    # message key either absent or null — not the secret string
    assert step.get("message") in (None, "", False) or "message" not in step
```

Adjust field names to match whatever step 1 chose. Use `confirm=True` and
valid step shape so pydantic validation passes (read `ActionQueueStep` fields
if construction fails).

If constructing full `ActionQueueRequest` is painful due to validators,
call the helper with a plain dict instead and type it as accepting
`ActionQueueRequest | dict` — keep it simple.

**Verify**: `python -m pytest -q tests/test_audit.py` → pass.

### Step 3: Full suite

```bash
python -m pytest -q
ruff check src tests
```

## Test plan

- Pure helper test in step 2 is sufficient (no need to drive full queue).
- Pattern: `tests/test_audit.py` style (simple asserts).

## Done criteria

- [ ] `grep -n "request.model_dump()" src/telemanager/action_queue_service.py`
      no longer feeds raw dump into `log_event` for queue completion
- [ ] Secret-like message string does not appear in helper output (test)
- [ ] `python -m pytest -q` passes
- [ ] `ruff check src tests` exit 0
- [ ] `plans/README.md` row 004 → DONE

## STOP conditions

- Another code path already dumps full queue messages into audit and fixing
  only this call is incomplete — fix this call first; report other paths
  rather than expanding scope without listing them in a follow-up.
- Verification fails twice.

## Maintenance notes

- New queue fields that carry free text should be added to the redaction
  helper explicitly.
- Reviewer: Activity UI must still show useful queue completion rows
  (counts, error string); only bodies are redacted.
- Run export JSON may still contain messages — that is intentional for
  operator debugging; do not silently strip runs.
