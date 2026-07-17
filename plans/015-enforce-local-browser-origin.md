<!-- markdownlint-disable MD013 MD060 -->

# Plan 015: Reject cross-origin state-changing requests to the localhost API

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- src/telemanager/main.py tests/test_security.py tests/test_app_password.py docs/SECURITY.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `5c26978`, 2026-07-16

## Why this matters

The Host allowlist blocks DNS rebinding, but a hostile web page can still submit
browser-compatible POST requests directly to `http://127.0.0.1:8000`. When the
optional password is disabled—the default—those requests can trigger local
state changes without reading the response. Current examples include starting a
Telegram login challenge and shutting down the process. TeleManager should
accept state changes from its own local browser origin and trusted non-browser
clients, but reject browser requests that explicitly identify a foreign origin.

## Current state

- `src/telemanager/main.py:58-70` installs `TrustedHostMiddleware` for
  `127.0.0.1`, `localhost`, and `::1`.
- `auth_middleware` at `main.py:73-104` checks only the optional app password;
  it does not inspect `Origin`, `Referer`, or Fetch Metadata.
- `src/telemanager/routes/system.py:79-82` exposes a simple bodyless POST that
  terminates the process.
- Form-compatible state changes include account login/code/password/logout in
  `src/telemanager/routes/accounts.py:49-86`.
- `tests/test_security.py` currently tests only Host rejection and allowed
  localhost hosts.
- The Vite development server proxies `/api` to port 8000. Requests can arrive
  with an Origin whose host is local but whose port is the Vite port; strict
  byte-for-byte origin equality would break development.
- Local-only remains a non-negotiable design constraint. This plan is not
  remote authentication, CORS enablement, TLS, or multi-user support.

## Decision for this plan

Add one small HTTP middleware/helper with this policy:

1. Safe methods `GET`, `HEAD`, and `OPTIONS` continue unchanged.
2. If a request has an `Origin` header, state-changing methods are accepted only
   when the origin parses as HTTP(S) and its hostname is one of the configured
   local `ALLOWED_HOSTS`. Ignore the origin port so the Vite proxy works.
3. `Origin: null`, malformed origins, credential-bearing origins, and foreign
   hostnames are rejected with 403 JSON.
4. If `Origin` is absent, use `Sec-Fetch-Site` as a browser signal: reject
   `cross-site`; accept `same-origin`, `same-site`, `none`, or an absent header.
   This preserves curl, TestClient, native launchers, and scripts that do not
   send browser origin metadata.
5. Do not use CORS middleware as the fix. CORS controls response readability;
   it does not reliably prevent the request side effect.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `PYTHONPATH=src python -m pytest -q tests/test_security.py tests/test_app_password.py` | all pass |
| Full backend | `PYTHONPATH=src python -m pytest -q` | all pass |
| Lint | `ruff check src tests scripts` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/main.py`
- `tests/test_security.py`
- `tests/test_app_password.py` only if middleware ordering requires an auth
  compatibility assertion
- `docs/SECURITY.md` for a concise same-origin guarantee
- `plans/README.md`

**Out of scope**:

- Adding CORS allowlists
- CSRF tokens or a frontend token protocol
- HTTPS, LAN/public exposure, or multi-user authorization
- Changing `TELEMANAGER_ALLOWED_HOSTS` semantics for the Host middleware
- Changing any route body or response schema
- Removing `/api/app/shutdown`

## Git workflow

- Branch: `advisor/015-enforce-local-browser-origin`
- Commit: `fix(security): reject cross-origin localhost mutations`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add pure origin-validation helpers

In `main.py`, add small helpers rather than embedding parsing branches in the
middleware. Use `urllib.parse.urlsplit` from the standard library.

Required behavior:

- Normalize allowed hosts for comparison: lower-case and strip surrounding
  brackets from IPv6 if necessary.
- Require scheme `http` or `https`.
- Reject origins with username/password components.
- Accessing `.port` can raise `ValueError` for malformed ports; catch it and
  reject.
- The origin hostname must be non-empty and in normalized `ALLOWED_HOSTS`.
- Never accept wildcard or suffix matches.

Name the helpers for intent, such as `is_trusted_browser_origin` and
`should_reject_cross_origin_mutation`.

**Verify**: `ruff check src/telemanager/main.py` → exit 0.

### Step 2: Install the check before auth and route execution

Create a dedicated `@app.middleware("http")` or add the check at the top of the
existing middleware. Ensure the policy runs before the request reaches any
route, regardless of whether app-password protection is enabled.

On rejection, return:

```python
JSONResponse(
    status_code=403,
    content={"detail": "Cross-origin state-changing requests are not allowed."},
)
```

Do not log request bodies or origin credentials. A warning log with the rejected
origin hostname is optional, but avoid noisy logging for every request.

**Verify**: existing app-password tests pass.

### Step 3: Add the security regression matrix

Extend `tests/test_security.py` using harmless endpoints. For the shutdown
endpoint, monkeypatch `telemanager.routes.system.threading.Timer` so the process
cannot exit.

Required cases:

1. Foreign `Origin` + `POST /api/app/shutdown` → 403 and timer not started.
2. Foreign `Origin` + a form-compatible POST such as `/api/accounts/login` →
   403 before route validation.
3. `Origin: null` + state-changing POST → 403.
4. Malformed Origin and credential-bearing Origin → 403.
5. `Sec-Fetch-Site: cross-site` without Origin + POST → 403.
6. Same local origin `http://127.0.0.1:8000` + POST reaches the route.
7. Local Vite-style origin `http://localhost:5173` with Host
   `localhost:8000` reaches the route.
8. IPv6 local origin reaches the route if TestClient can represent it
   consistently; otherwise cover the pure helper directly.
9. No Origin and no Fetch Metadata reaches the route, preserving TestClient
   and CLI callers.
10. Foreign Origin on GET is not blocked by this middleware (normal auth and
    route behavior still apply).
11. Existing foreign Host test still returns 400.

Use response status or monkeypatched side effects; do not contact Telegram.

**Verify**:
`PYTHONPATH=src python -m pytest -q tests/test_security.py tests/test_app_password.py`
→ all pass.

### Step 4: Document the exact boundary

Update `docs/SECURITY.md` under Local-Only Default:

- Host allowlisting prevents DNS rebinding.
- Browser-identified cross-origin state-changing requests are rejected.
- Requests without browser origin metadata remain supported for local CLI/test
  clients.
- These controls do not make remote exposure safe; HTTPS, CSRF strategy, and
  user access controls are still required before non-local binding.

Do not claim full remote-ready CSRF protection.

### Step 5: Run the full backend gate

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
```

Expected: all pass.

## Test plan

The eleven cases in Step 3 are the acceptance matrix. Tests must be deterministic,
open no browser, make no network calls, and never actually invoke `os._exit`.

## Done criteria

- [ ] Explicitly foreign, null, malformed, and credential-bearing origins are
      rejected before state-changing routes run.
- [ ] `Sec-Fetch-Site: cross-site` is rejected when Origin is absent.
- [ ] Local production, Vite, IPv6 (helper or HTTP), and non-browser callers
      remain supported.
- [ ] Safe methods are unaffected by the origin check.
- [ ] Existing Host and app-password protections remain green.
- [ ] Security docs describe the boundary without claiming remote readiness.
- [ ] Full backend tests and Ruff pass.
- [ ] No files outside scope are modified.
- [ ] Plan 015 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- Vite changes Host/Origin in a way the stated hostname policy cannot support.
- Supporting a required client needs a broad wildcard origin.
- The implementation starts depending on request bodies or adding frontend
  tokens.
- Middleware ordering causes foreign requests to reach a route before the
  rejection.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Any future non-browser client should omit browser Fetch Metadata or send a
trusted local Origin. If TeleManager is ever intentionally exposed beyond
localhost, replace this local policy as part of a complete authenticated HTTPS
threat model; do not merely add the remote hostname to `ALLOWED_HOSTS`.
