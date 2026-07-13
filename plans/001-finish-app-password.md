# Plan 001: Finish optional app-password (middleware, setup hardening, logout, UI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 471cc28..HEAD -- src/telemanager/main.py src/telemanager/routes/auth.py src/telemanager/app_password.py apps/web/src/App.tsx apps/web/src/screens/settings-screen.tsx apps/web/src/lib/api.ts apps/web/src/hooks/use-app-state.ts apps/web/src/components/welcome-modal.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `471cc28`, 2026-07-13

## Why this matters

The optional shared-machine app password is half-shipped and currently
self-defeating:

1. When a password is enabled, `auth_middleware` returns 401 for every
   non-exempt path — including `/` and the SPA shell — so the browser never
   gets HTML/JS that could show a login form.
2. `/api/auth/setup` is fully middleware-exempt and does not require knowing
   the current password, so any process that can hit `127.0.0.1:8000` can
   enable, change, or clear the password.
3. Logout only clears the browser cookie; the server-side token in
   `active_sessions` remains valid for up to 24 hours.
4. There is no Settings UI and no login gate in the React app.

This plan finishes the feature so it is usable and not trivially bypassable
on a shared machine. It does **not** turn TeleManager into a multi-user or
remote-auth product — local-only + TrustedHost still apply.

## Current state

### Middleware (`src/telemanager/main.py`)

```python
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Check app password if enabled. Exempt auth endpoints and static assets."""
    # Skip auth for login/status endpoints and static files
    if request.url.path.startswith(("/api/auth/", "/assets/", "/favicon.ico")):
        return await call_next(request)

    # If password protection is disabled, allow all requests
    if not is_password_enabled():
        return await call_next(request)

    # Check session cookie
    session_token = request.cookies.get("telemanager_session")
    clear_expired_sessions(active_sessions)

    if session_token and is_session_valid(session_token, active_sessions):
        return await call_next(request)

    # No valid session - return 401
    return JSONResponse(
        status_code=401,
        content={"detail": "Authentication required. Log in to continue."},
    )
```

Problems:

- SPA document routes (`/`, `/favicon.svg`, root brand files) are not exempt.
- 401 for HTML navigations returns JSON instead of the SPA (so no login UI).

### Auth routes (`src/telemanager/routes/auth.py`)

- `POST /api/auth/login` — Form `password`, sets `telemanager_session` cookie
  (`httponly=True`, `secure=False`, `samesite=lax`). Annotation
  `response: Response = None` is sloppy but FastAPI injects Response; leave
  alone unless you touch the signature for another reason.
- `POST /api/auth/logout` — only `delete_cookie`; does **not** remove the
  token from `active_sessions`.
- `POST /api/auth/setup` — body `{password}` (empty disables). No
  `current_password`. Fully exempt via `/api/auth/` prefix.
- `GET /api/auth/status` — `{password_enabled: bool}`.

### Password helpers (`src/telemanager/app_password.py`)

- Hash stored in `app_settings_doc` under key `password_hash` (bcrypt).
- Sessions: in-memory `active_sessions: dict[token, expires_iso]` in
  `runtime.py` (cleared on process restart — fine for local).
- Helpers: `is_password_enabled`, `verify_app_password`, `set_app_password`,
  `create_session`, `is_session_valid`, `clear_expired_sessions`.

### Frontend

- **No** references to `/api/auth/*`, `password_enabled`, or
  `telemanager_session` anywhere under `apps/web/`.
- App bootstraps via `useAppState` → `useInitialLoad` which immediately
  `refresh()` / load runs / presets / etc. with no auth check
  (`apps/web/src/hooks/use-app-state.ts`).
- Settings tabs today: `api | network | appearance | safety`
  (`apps/web/src/screens/settings-screen.tsx`).
- Login UI pattern exemplar: `apps/web/src/components/welcome-modal.tsx`
  (ModalShell + form fields) and `apps/web/src/ui/modal.tsx`.
- API client: `apps/web/src/lib/api.ts` — throws `Error` with
  `payload.detail` on non-OK; no special 401 handling.

### Conventions to match

- Backend: FastAPI routers, `HTTPException(status_code=400/401)`,
  `log_event(...)` for audit, pydantic `BaseModel` bodies.
- Frontend: Arc theme primitives (`Panel`, `Field`, `Button` from
  `components/ui.tsx` / `ui/button.tsx`), `api()` + `toForm` from `lib/api.ts`.
- Commits: conventional (`feat(auth): ...`, `fix(auth): ...`) — see recent
  `git log`.
- Local-only non-negotiable (AGENTS.md): bind `127.0.0.1`, no multi-user
  remote auth project.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend tests | `python -m pytest -q` | all pass |
| Backend lint | `ruff check src tests` | exit 0 |
| Frontend typecheck | `npm --prefix apps/web run typecheck` | exit 0 |
| Frontend lint | `npm --prefix apps/web run lint` | exit 0 |
| Frontend tests | `npm --prefix apps/web run test` | exit 0 |
| Frontend build | `npm --prefix apps/web run build` | exit 0 |

## Scope

**In scope** (only these files — create if missing):

- `src/telemanager/main.py` — middleware exemption + SPA handling
- `src/telemanager/routes/auth.py` — setup hardening, logout invalidation
- `src/telemanager/app_password.py` — only if a tiny pure helper is needed
  (e.g. `invalidate_session`); prefer keeping logic in the route if one-liner
- `apps/web/src/App.tsx` — auth gate wrapper
- `apps/web/src/lib/api.ts` — optional 401 signal (minimal)
- `apps/web/src/hooks/use-app-state.ts` — only if needed to delay initial load
  until authenticated
- `apps/web/src/screens/settings-screen.tsx` — new Security tab
- `apps/web/src/components/app-password-gate.tsx` (create) — login modal/gate
- `tests/test_app_password.py` — leave for plan 002; do not expand heavily
  here beyond what you need to keep the suite green if you change helpers

**Out of scope**:

- CSRF tokens, HTTPS, remote exposure, multi-user accounts
- Changing TrustedHostMiddleware / `ALLOWED_HOSTS`
- Encrypting session files or config
- Plan 002's full TestClient matrix (write only the minimum self-check you
  need; 002 owns HTTP coverage)
- Redesigning Settings layout beyond adding one tab

## Git workflow

- Branch: `advisor/001-finish-app-password`
- Commits: conventional, e.g. `fix(auth): invalidate session on logout`,
  `feat(web): app-password login gate`
- Do NOT push or open a PR unless the operator asked.

## Steps

### Step 1: Server-side logout invalidation

In `routes/auth.py` `logout`:

1. Read `telemanager_session` cookie from the request (add
   `request: Request` parameter).
2. If present, `active_sessions.pop(token, None)`.
3. Still `delete_cookie("telemanager_session")`.
4. Keep the existing `log_event("auth_logout", ...)`.

**Verify**: mentally trace that a second request with the old cookie fails
`is_session_valid` (plan 002 will automate this). `ruff check src/telemanager/routes/auth.py` → exit 0.

### Step 2: Harden `POST /api/auth/setup`

Contract:

| State | Body | Result |
|-------|------|--------|
| Password **disabled** | `{ "password": "new" }` | enable; no current password needed |
| Password **disabled** | `{ "password": "" }` | no-op, stay disabled, 200 |
| Password **enabled** | `{ "password": "new", "current_password": "<correct>" }` | rotate |
| Password **enabled** | `{ "password": "", "current_password": "<correct>" }` | disable |
| Password **enabled** | missing/wrong `current_password` | **401** or **400**, no change |

Implementation notes:

- Extend `PasswordSetupRequest` with optional
  `current_password: str | None = None` (max_length 128).
- When `is_password_enabled()` and the caller is trying to change/disable:
  require `verify_app_password(current_password or "")` else raise 401
  `"Current password is required."` / `"Invalid current password."`.
- When password is **not** enabled, ignore `current_password` and allow first
  enable (shared-machine bootstrap).
- Keep empty `password` = disable only when authorized as above.

**Verify**: `ruff check src/telemanager/routes/auth.py` → exit 0.

### Step 3: Middleware — serve SPA shell without session; gate only `/api/*`

Goal when password is enabled and session is missing:

- **Browser can load the SPA** (HTML + static assets) so a login gate can run.
- **All `/api/*` except `/api/auth/*` return 401 JSON**.

Concrete change in `auth_middleware`:

1. Keep exempt: `/api/auth/`, `/assets/`, `/favicon.ico` (and any existing
   root static whitelist paths if already matched elsewhere — static router
   serves them; they must not 401).
2. After password-enabled + invalid/missing session:
   - If path starts with `/api/`: return the existing 401 JSONResponse.
   - Else: `return await call_next(request)` so `/`, favicons, brand PNGs,
     and `index.html` load.

Do **not** exempt all non-API paths in a way that re-opens API. Do **not**
return a custom HTML login page from the backend — the React gate owns UI.

Also ensure mounted StaticFiles `/assets` remains reachable (already exempt
by prefix).

**Verify** (manual with TestClient after temporary password set, or wait for
plan 002):

```python
# sketch — full tests live in plan 002
# GET / → 200 (or 503 if dist missing; in tests conftest stubs dist)
# GET /api/config without cookie → 401 when password enabled
# GET /api/auth/status → 200 always
```

`ruff check src/telemanager/main.py` → exit 0.

### Step 4: Frontend API 401 signal (minimal)

In `apps/web/src/lib/api.ts`, when `!response.ok` and
`response.status === 401`, throw an Error that is easy to detect, e.g.
`error.name = "AuthRequiredError"` or message starts with a stable prefix.
Keep existing `detail` message for toasts.

Do **not** add a global event bus or new dependency.

**Verify**: `npm --prefix apps/web run typecheck` → exit 0.

### Step 5: Auth gate component + App wiring

Create `apps/web/src/components/app-password-gate.tsx`:

1. On mount, `GET /api/auth/status` → if `!password_enabled`, render
   `children` immediately.
2. If enabled, try a cheap authenticated probe only if you need one — or
   treat "not yet logged in" as default until login succeeds. Prefer:
   - show login form when enabled
   - on submit: `POST /api/auth/login` with `toForm({ password })`
     (`credentials: "same-origin"` is default for same-origin fetch — keep
     cookies)
   - on success, set local `unlocked=true` and render children
3. While locked, **do not** render the main shell / do not let
   `useInitialLoad` fire API calls that will 401-spam.

Wire in `App.tsx`:

```tsx
// Pseudocode shape — match existing style
return (
  <AppPasswordGate>
    {/* existing App body */}
  </AppPasswordGate>
)
```

Delay `useInitialLoad` until the gate reports unlocked. Cleanest options
(pick one, YAGNI):

- **Preferred**: move the initial-load effect into a child that only mounts
  inside the gate after unlock, or pass `enabled: unlocked` into
  `useAppState` / `useInitialLoad` and skip the effect when false.
- Avoid double-fetching after login.

Login UI: small centered card, Arc styles (`Panel`/`Field`/`Button`),
password input, submit, error text. No new icon pack deps — reuse
`@tabler/icons-react` already used in settings.

**Verify**: `npm --prefix apps/web run typecheck` and
`npm --prefix apps/web run lint` → exit 0.

### Step 6: Settings → Security tab

In `settings-screen.tsx`:

1. Extend `SettingsTab` with `"security"`.
2. Add nav entry: label "Security", detail "Optional app password", icon
   e.g. `IconLock` / `IconShieldLock` (already imported for safety).
3. Panel contents:
   - Status line: Enabled / Disabled (from `GET /api/auth/status` via
     react-query or a simple `useEffect` load — match nearby settings
     patterns; network tab already fetches on mount).
   - When disabled: password + confirm fields → `POST /api/auth/setup`
     with `{ password }`.
   - When enabled: current password + new password (optional empty =
     disable) → `POST /api/auth/setup` with
     `{ password: newOrEmpty, current_password }`.
   - Logout button → `POST /api/auth/logout` then force gate to lock
     (set unlocked false / reload).

Match Field/Button/Panel patterns from the API credentials tab in the same
file.

**Verify**: `npm --prefix apps/web run typecheck` → exit 0;
`npm --prefix apps/web run build` → exit 0.

### Step 7: Full suite green

```bash
python -m pytest -q
ruff check src tests
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run test
npm --prefix apps/web run build
```

All exit 0 / all tests pass.

## Test plan

- Full automated HTTP matrix is **plan 002**.
- Here, only ensure existing tests still pass. If you touch
  `app_password.py` pure helpers, extend `tests/test_app_password.py` with
  unit tests for any new pure function.
- Manual smoke (optional if you can run the app): enable password in
  Settings → refresh → login gate → login → Settings → disable.

## Done criteria

- [ ] With password enabled and no cookie: `GET /api/config` → 401;
      `GET /` still serves SPA (200 with dist present)
- [ ] With password enabled: setup without correct `current_password` does
      not change the hash
- [ ] Logout removes token from `active_sessions` (old cookie no longer
      authorizes)
- [ ] Frontend shows login gate when enabled; Settings has Security tab
- [ ] `python -m pytest -q` passes
- [ ] `ruff check src tests` exit 0
- [ ] `npm --prefix apps/web run typecheck` / `lint` / `test` / `build` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` row for 001 → DONE

## STOP conditions

- Code at the cited locations no longer matches Current state excerpts.
- Fix appears to require remote auth, CSRF framework, or HTTPS.
- You believe the product decision should be **delete** the app-password
  feature instead of finishing it — stop and report; do not delete without
  operator confirmation (this plan chose "finish").
- A verification command fails twice after a reasonable fix.

## Maintenance notes

- Plan 002 adds the regression net; do not skip 002.
- If sessions ever move to durable storage, logout invalidation and
  expiry must move with them.
- Reviewer should confirm middleware never returns 200 for `/api/*` without
  a valid session when password is enabled.
