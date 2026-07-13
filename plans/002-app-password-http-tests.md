# Plan 002: HTTP tests for app-password middleware and auth routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- src/telemanager/main.py src/telemanager/routes/auth.py src/telemanager/app_password.py tests/test_app_password.py tests/test_security.py tests/conftest.py`
> Confirm plan 001 behaviour is present (SPA non-API allowed when locked;
> setup requires current password when enabled; logout pops
> `active_sessions`). If 001 is not done, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-finish-app-password.md
- **Category**: tests
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

Today `tests/test_app_password.py` only covers pure session dict helpers.
`tests/test_security.py` covers Host allowlist only. There is no TestClient
coverage for:

- middleware 401 on `/api/*` when password enabled
- SPA `/` still loading when locked
- setup bootstrap vs rotate/disable with current password
- logout server-side invalidation

Without these, plan 001 can regress silently.

## Current state

### Test harness (`tests/conftest.py`)

- `app_context` fixture: temp `TELEMANAGER_DATA_DIR` / `SESSIONS_DIR`, stubs
  frontend dist with `index.html`, reloads `telemanager` modules, yields
  `TestClient(main.app, base_url="http://127.0.0.1")` so TrustedHost passes.
- `client` fixture = `app_context["client"]`.
- `add_account(...)` helper for account tests.

### Existing password tests (`tests/test_app_password.py`)

Unit-only: `create_session`, `is_session_valid`, `clear_expired_sessions`,
duration. Docstring admits password storage tests were skipped.

### Auth API after plan 001 (expected contract)

| Request | Password off | Password on, no session | Password on, valid session |
|---------|--------------|-------------------------|----------------------------|
| `GET /api/auth/status` | 200 | 200 | 200 |
| `GET /api/config` | 200 | **401** | 200 |
| `GET /` | 200 | **200** (SPA) | 200 |
| `POST /api/auth/login` wrong | 401 | 401 | 401 |
| `POST /api/auth/login` right | 200 + cookie | 200 + cookie | 200 |
| `POST /api/auth/setup` enable | 200 | n/a (off) | needs current |
| `POST /api/auth/logout` | 200 | 200 | 200; old cookie dead |

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `python -m pytest -q tests/test_app_password.py tests/test_security.py` | all pass |
| Full suite | `python -m pytest -q` | all pass |
| Lint | `ruff check src tests` | exit 0 |

## Scope

**In scope**:

- `tests/test_app_password.py` (extend) **or** new
  `tests/test_app_password_http.py` if the file gets too mixed — prefer
  extending one file unless it exceeds ~250 lines of mixed unit+HTTP
- Optionally a tiny helper in `tests/conftest.py` only if reused 3+ times
  (e.g. `enable_app_password(client, password)`); otherwise keep helpers
  local to the test module

**Out of scope**:

- Frontend Vitest for the gate (manual/typecheck sufficient for 001)
- Changing production auth code except trivial testability fixes (if a fix
  is required, STOP and report — 001 should have landed the contract)
- CSRF / multi-user tests

## Git workflow

- Branch: `advisor/002-app-password-http-tests` (or continue 001 branch)
- Commit: `test(auth): cover middleware and setup/logout contracts`
- Do NOT push unless asked.

## Steps

### Step 1: Helpers in the test module

```python
def enable_password(client, password: str = "secret-pass") -> None:
    r = client.post("/api/auth/setup", json={"password": password})
    assert r.status_code == 200
    assert r.json()["password_enabled"] is True

def login(client, password: str = "secret-pass"):
    return client.post(
        "/api/auth/login",
        data={"password": password},
    )
```

Use the same `client` fixture (cookies persist on TestClient).

**Verify**: helpers compile; no production import of test helpers.

### Step 2: Cases to implement (each is one `test_*`)

1. **`test_api_open_when_password_disabled`** — `GET /api/config` → 200;
   body has `api_hash_configured` key (existing shape).
2. **`test_api_401_when_password_enabled_without_session`** — enable;
   new client or clear cookies; `GET /api/config` → 401;
   detail mentions authentication.
3. **`test_spa_index_allowed_when_password_enabled_without_session`** —
   enable; clear cookies; `GET /` → 200 (conftest stubs index.html).
4. **`test_auth_status_always_public`** — enable; no cookie;
   `GET /api/auth/status` → 200, `password_enabled is True`.
5. **`test_login_sets_cookie_and_unlocks_api`** — enable; login;
   `GET /api/config` → 200.
6. **`test_login_rejects_wrong_password`** — enable; login wrong → 401;
   still no access to `/api/config`.
7. **`test_setup_requires_current_password_when_enabled`** — enable
   `"a"`; try setup `{"password": "b"}` without current → 401/400;
   status still enabled; login with `"a"` still works.
8. **`test_setup_rotate_with_current_password`** — enable `"a"`; setup
   `{"password": "b", "current_password": "a"}` → 200; login `"a"` fails;
   login `"b"` works.
9. **`test_setup_disable_with_current_password`** — enable; setup
   `{"password": "", "current_password": "..."}` →
   `password_enabled is False`; `/api/config` works without cookie.
10. **`test_logout_invalidates_server_session`** — enable; login; capture
    cookie value; logout; `GET /api/config` with that cookie → 401.
    Implementation tip: after login, read
    `client.cookies.get("telemanager_session")`, call logout, then
    `client.cookies.set("telemanager_session", old)` and assert 401 —
    or inspect `app_context["main"].active_sessions` is empty after logout.

Match style of `tests/test_security.py` and `tests/test_queue_cancellation.py`
(plain asserts, no unittest classes).

**Verify**:
`python -m pytest -q tests/test_app_password.py -k "password or auth or spa or logout or setup or login"`
→ all new tests pass.

### Step 3: Full suite + lint

```bash
python -m pytest -q
ruff check src tests
```

Both green.

## Test plan

- This plan **is** the test plan. No production behaviour change.
- Pattern: `tests/test_security.py` (TestClient + host headers),
  `tests/test_queue_cancellation.py` (seed state + POST).

## Done criteria

- [ ] At least the 10 cases above exist and pass
- [ ] `python -m pytest -q` full suite passes
- [ ] `ruff check src tests` exit 0
- [ ] No production files changed (or only a one-line testability fix
      pre-approved by STOP report)
- [ ] `plans/README.md` row 002 → DONE

## STOP conditions

- Plan 001 contract not present in code (middleware still 401s `/`, or
  setup still open when enabled).
- TestClient cannot see cookies / sessions (debug first; do not weaken
  production checks to make a bad test pass).
- Verification fails twice.

## Maintenance notes

- Any future auth change must update these tests in the same PR.
- Reviewer: ensure tests fail if middleware re-exempts all of `/api/auth/`
  including a reckless `setup` without current password — case 7 is the
  guard.
