<!-- markdownlint-disable MD013 MD060 -->

# Plan 013: Preserve the app-password hash when saving application preferences

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- src/telemanager/app_settings.py src/telemanager/app_password.py src/telemanager/routes/settings.py tests/test_dialog_photos.py tests/test_app_password.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security, bug
- **Planned at**: commit `5c26978`, 2026-07-16

## Why this matters

`show_dialog_photos` and the optional bcrypt `password_hash` share
`data/app_settings.json`. The display-settings writer currently replaces the
whole document with the one public preference. Saving the photo preference
therefore deletes the hash, silently disables the app-password middleware, and
reopens every API route to an unauthenticated local browser. The fix is a
locked partial update, not a storage redesign.

## Current state

- `src/telemanager/app_settings.py:24-32` reads the shared document but writes a
  replacement object:

```python
def app_settings() -> dict:
    settings = app_settings_doc.read({})
    return AppSettingsRequest(**settings).model_dump()


def save_app_settings(request: AppSettingsRequest) -> dict:
    settings = request.model_dump()
    app_settings_doc.write(settings)
    return settings
```

- `src/telemanager/app_password.py:22-54` reads and writes `password_hash` in
  that same `app_settings_doc`.
- `src/telemanager/store.py:48-59` provides the correct process-wide
  read-modify-write primitive: `Document.mutate(default)`.
- `src/telemanager/routes/settings.py:32-39` exposes `GET/POST
  /api/settings/app`.
- `tests/test_dialog_photos.py:21-30` proves the visible preference round-trip
  but never seeds an unrelated private key.
- Backend persistence convention: when updating part of a shared document,
  use `with <doc>.mutate({}) as settings: settings.update(...)`; see
  `src/telemanager/routes/config.py` and `src/telemanager/presets_service.py`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `PYTHONPATH=src python -m pytest -q tests/test_dialog_photos.py tests/test_app_password.py` | all pass |
| Full backend | `PYTHONPATH=src python -m pytest -q` | all pass |
| Lint | `ruff check src tests scripts` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/app_settings.py`
- `tests/test_dialog_photos.py`
- `tests/test_app_password.py` only if the regression is clearer there than in
  `test_dialog_photos.py`
- `plans/README.md` status update

**Out of scope**:

- Changing bcrypt, cookie, session-token, or middleware behavior
- Moving `password_hash` into another file
- Changing the `/api/settings/app` request or response shape
- Adding new application preferences
- Frontend changes

## Git workflow

- Branch: `advisor/013-preserve-app-password-settings`
- Commit: `fix(settings): preserve app password on preference writes`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Convert the preference write to a locked partial update

In `save_app_settings`:

1. Build `updates = request.model_dump()`.
2. Use `with app_settings_doc.mutate({}) as settings:`.
3. Apply `settings.update(updates)` without clearing the document.
4. Return the public model projection by calling `app_settings()` after the
   mutation. Do not return the raw shared document because it contains the
   private password hash.

Target shape:

```python
def save_app_settings(request: AppSettingsRequest) -> dict:
    updates = request.model_dump()
    with app_settings_doc.mutate({}) as settings:
        settings.update(updates)
    return app_settings()
```

**Verify**: `ruff check src/telemanager/app_settings.py` → exit 0.

### Step 2: Add an HTTP regression test for the actual security failure

Add a test using the existing helpers in `tests/test_app_password.py` or the
settings round-trip pattern in `tests/test_dialog_photos.py`:

1. Enable a temporary app password through `/api/auth/setup`.
2. Log in so `/api/settings/app` is authorized.
3. POST `{"show_dialog_photos": false}`.
4. Assert the response still contains only the public preference.
5. Clear cookies.
6. Assert `/api/auth/status` still reports `password_enabled: true`.
7. Assert unauthenticated `GET /api/config` returns 401.
8. Assert login with the original password still succeeds.

Never read or assert a real hash value. A temporary test password literal is
fine; no secret from local data may enter the test.

**Verify**:
`PYTHONPATH=src python -m pytest -q tests/test_app_password.py tests/test_dialog_photos.py`
→ all pass.

### Step 3: Add a direct persistence assertion

In the same test or a small adjacent test, seed the shared app-settings
document with an unrelated sentinel key, save the public preference, and assert
that the sentinel remains while `app_settings()` still exposes only
`show_dialog_photos`. This protects future private keys, not only
`password_hash`.

Use `app_context["config"].read_json(...)` or import the shared document through
`telemanager.documents`; do not create a second `Document` instance for the
same path.

**Verify**: focused tests pass.

### Step 4: Run the full backend gate

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
```

Expected: all tests pass and Ruff reports no issues.

## Test plan

- Security regression: saving a display preference does not disable an enabled
  app password.
- Data-preservation regression: unrelated shared-document keys survive.
- API contract: response remains `{"settings": {"show_dialog_photos": ...}}`
  and never exposes `password_hash`.
- Existing password rotation, disable, logout, and photo-setting tests remain
  green.

## Done criteria

- [ ] `save_app_settings` uses `app_settings_doc.mutate({})` or an equivalent
      locked partial update.
- [ ] Saving app settings preserves `password_hash` and arbitrary unrelated
      keys.
- [ ] Public app-settings responses contain no private keys.
- [ ] An HTTP regression proves unauthenticated API access remains 401 after
      the preference write.
- [ ] `PYTHONPATH=src python -m pytest -q` passes.
- [ ] `ruff check src tests scripts` exits 0.
- [ ] No files outside the in-scope list are modified.
- [ ] Plan 013 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- `app_settings.py` already performs a locked partial update at execution time.
- The password hash has moved out of `app_settings_doc`.
- Preserving the hash appears to require changing the public API schema.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Any future writer of `app_settings_doc` must preserve keys it does not own and
must return a public projection rather than the raw document. Reviewers should
specifically reject `app_settings_doc.write(request.model_dump())` in future
preference additions.
