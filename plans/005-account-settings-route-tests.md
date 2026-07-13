# Plan 005: Account-settings route integration tests (mocked Telethon)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- src/telemanager/routes/account_settings.py src/telemanager/account_settings_service.py tests/test_account_settings.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

Phase 1 account settings ships many live routes (`/profile`, `/username`,
`/sessions`, contacts, blocked, photo, TTL) but
`tests/test_account_settings.py` only covers pure helpers plus "router is
mounted". A wiring or ValueError→400 regression would not fail CI. This plan
adds TestClient tests with Telethon mocked at the service boundary so CI
stays offline.

## Current state

### Routes (`src/telemanager/routes/account_settings.py`)

Pattern for every handler:

```python
@router.get("/api/accounts/{account_id}/profile")
async def get_profile(account_id: str) -> dict:
    try:
        return await svc.get_profile(manager, account_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc
```

Key paths (non-exhaustive — open the file for the full list):

- `GET/POST /api/accounts/{id}/profile`
- `POST /api/accounts/{id}/username`
- `GET /api/accounts/{id}/sessions`
- `POST /api/accounts/{id}/sessions/terminate`
- `POST /api/accounts/{id}/sessions/terminate-others`
- `GET/POST/DELETE /api/accounts/{id}/contacts`
- `GET /api/accounts/{id}/blocked`
- `GET/POST /api/accounts/{id}/ttl`
- `POST/DELETE /api/accounts/{id}/photo`

### Service (`src/telemanager/account_settings_service.py`)

- `_client_op` uses `manager.temp_client` and maps `RPCError` → `ValueError`.
- Pure helpers already tested: `normalize_username`, `validate_username`,
  `clean_profile_field`, `validate_ttl_days`, `_authorization_dict`.
- Writes call `log_event` and sometimes
  `manager._refresh_account_identity` + `_save_accounts`.

### Existing tests

```python
def test_account_settings_router_is_mounted():
    from telemanager.main import app
    paths = {route.path for route in app.routes}
    assert "/api/accounts/{account_id}/profile" in paths
```

### Mocking style elsewhere

`tests/test_queue_worker.py` and `tests/test_advanced_actions.py` use
`monkeypatch.setattr` and small Fake clients. Prefer **monkeypatching
service functions** from the route module's `svc` import for HTTP tests:

```python
async def fake_get_profile(manager, account_id):
    return {"first_name": "Ada", "last_name": None, "username": "ada", "phone": None, "about": None}

monkeypatch.setattr(
    "telemanager.routes.account_settings.svc.get_profile",
    fake_get_profile,
)
```

This avoids inventing a full Telethon stack.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused | `python -m pytest -q tests/test_account_settings.py` | all pass |
| Full | `python -m pytest -q` | all pass |
| Lint | `ruff check src tests` | exit 0 |

## Scope

**In scope**:

- `tests/test_account_settings.py` (extend heavily)
- Production code **only** if a route is untestable without a one-line
  export — prefer not to touch production

**Out of scope**:

- Live Telegram network tests
- Frontend modal tests for account settings
- Expanding account settings features (Phase 1b leftovers)

## Git workflow

- Branch: `advisor/005-account-settings-route-tests`
- Commit: `test(accounts): HTTP coverage for account settings routes`
- Do NOT push unless asked.

## Steps

### Step 1: Shared fixtures in the test file

Using `app_context` / `client` / `add_account` from conftest:

```python
def test_get_profile_ok(app_context, client, monkeypatch):
    add_account(app_context, "acc-1", "Primary")
    async def fake_get_profile(manager, account_id):
        assert account_id == "acc-1"
        return {"first_name": "Ada", "last_name": None, "username": "ada", "phone": None, "about": "hi"}
    monkeypatch.setattr(
        "telemanager.routes.account_settings.svc.get_profile",
        fake_get_profile,
    )
    r = client.get("/api/accounts/acc-1/profile")
    assert r.status_code == 200
    assert r.json()["first_name"] == "Ada"
```

### Step 2: Minimum route matrix (implement all)

For each, mock the corresponding `svc.*` coroutine/function and assert
status + a key field:

| Test name | Method / path | Mock | Assert |
|-----------|---------------|------|--------|
| `test_get_profile_ok` | GET profile | `get_profile` | 200 + body |
| `test_get_profile_value_error_is_400` | GET profile | raise `ValueError("nope")` | 400, detail `nope` |
| `test_update_profile_ok` | POST profile JSON | `update_profile` → account public dict-ish | 200 |
| `test_update_username_ok` | POST username | `update_username` | 200 |
| `test_list_sessions_ok` | GET sessions | `list_sessions` → `{"sessions":[]}` | 200 |
| `test_terminate_session_ok` | POST terminate | `terminate_session` | 200 |
| `test_terminate_others_ok` | POST terminate-others | `terminate_other_sessions` | 200 |
| `test_list_contacts_ok` | GET contacts | `list_contacts` | 200 |
| `test_add_contact_ok` | POST contacts | `add_contact` | 200 |
| `test_delete_contact_ok` | DELETE contacts?identifier= | `delete_contact` | 200 |
| `test_list_blocked_ok` | GET blocked | `list_blocked` | 200 |
| `test_get_ttl_ok` | GET ttl | `get_ttl` | 200 |
| `test_set_ttl_ok` | POST ttl | `set_ttl` | 200 |
| `test_set_ttl_validation_422_or_400` | POST ttl `{"days": 45}` | (no mock needed if pydantic/service rejects) | 422 or 400 |
| `test_missing_account_bubbles_400` | GET profile unknown id | let real service run **or** mock raise not found | 400 |

Open `account_settings_service.py` and `routes/account_settings.py` to match
**exact** function names and response envelopes (`{"account": ...}` vs raw
profile dict). Do not invent response shapes — assert against what the route
returns after the mock.

Photo upload routes: optional. If easy with `client.post(..., files=...)`,
add one happy-path mock for `set_profile_photo`; otherwise skip photo and
note in the commit body (YAGNI).

### Step 3: Keep pure helper tests

Do not delete existing helper tests. New HTTP tests append below them.

**Verify**:
`python -m pytest -q tests/test_account_settings.py` → all pass.

### Step 4: Full suite + lint

```bash
python -m pytest -q
ruff check src tests
```

## Test plan

- This plan is the test plan.
- Pattern: `tests/test_queue_cancellation.py` + monkeypatch style from
  `tests/test_queue_worker.py`.

## Done criteria

- [ ] ≥12 new HTTP tests covering the matrix above
- [ ] At least one `ValueError` → 400 case
- [ ] `python -m pytest -q tests/test_account_settings.py` passes
- [ ] Full suite passes; ruff clean
- [ ] No production behaviour change (tests only)
- [ ] `plans/README.md` row 005 → DONE

## STOP conditions

- Route module was refactored so `svc` is not
  `telemanager.routes.account_settings.svc` — adjust patch path, do not
  rewrite routes.
- You feel compelled to hit real Telegram — STOP; mock only.
- Verification fails twice.

## Maintenance notes

- New account-settings routes should add one mock HTTP test in the same PR.
- Reviewer: ensure tests patch the route's `svc` binding, not a second
  import path that leaves the route calling the real service.
