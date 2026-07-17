<!-- markdownlint-disable MD013 MD060 -->

# Plan 017: Make sensitive session exports atomic and collision-safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5c26978..HEAD -- src/telemanager/sessions_service.py src/telemanager/routes/accounts.py tests/test_dialogs_sessions.py`
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

Export ZIPs contain Telegram authentication material. `export_sessions`
currently opens the final archive and starts writing selected sessions before
it has verified the full request. If a later account is missing its session,
the endpoint returns an error but leaves a partial ZIP containing earlier
session files in `data/exports/`. Timestamp-only names also collide when two
exports start in the same second. Export must preflight every source, build at a
unique temporary path, and publish the final ZIP only after success.

## Current state

`src/telemanager/sessions_service.py:104-127`:

```python
export_path = EXPORTS_DIR / f"telemanager-export-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.zip"
metadata = []
with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for account_id in account_ids:
        account = manager._get_account(account_id)
        source = session_file_path(account.session_name)
        if not source.exists():
            raise ValueError(f"Session file missing for {account.label}.")
        archive.write(source, f"sessions/{source.name}")
        ...
return export_path
```

- `src/telemanager/routes/accounts.py:180-192` emits the export audit event only
  after `export_sessions` returns, which is correct and must remain so.
- `tests/test_dialogs_sessions.py:165-188` verifies redacted metadata and archive
  members for one successful export.
- `src/telemanager/config.py::write_json` demonstrates the repository's
  temp-file-then-replace convention.
- Security constraint: never put real session bytes, phone numbers, API hashes,
  or local paths into tests, logs, or plan output.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `PYTHONPATH=src python -m pytest -q tests/test_dialogs_sessions.py` | all pass |
| Full backend | `PYTHONPATH=src python -m pytest -q` | all pass |
| Lint | `ruff check src tests scripts` | exit 0 |

## Scope

**In scope**:

- `src/telemanager/sessions_service.py`
- `tests/test_dialogs_sessions.py`
- `src/telemanager/routes/accounts.py` only if error translation needs a small
  adjustment; prefer no route change
- `plans/README.md`

**Out of scope**:

- Encrypting or password-protecting exports
- Changing metadata fields or the redaction default
- Automatically deleting successful downloads
- Session import limits (Plan 018)
- Changing `data/exports/` location or adding a database
- Logging session contents or source paths

## Git workflow

- Branch: `advisor/017-atomic-session-export`
- Commit: `fix(sessions): publish exports only after complete validation`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Preflight the complete export request

Before creating any output file:

1. Resolve every account with `manager._get_account`.
2. Resolve every session path.
3. Require `source.is_file()`, not only `exists()`.
4. Build metadata in memory, applying the existing phone redaction.
5. Reject duplicate account IDs or deliberately deduplicate them while
   preserving request order. Preferred: reject duplicates with a readable
   `ValueError`; duplicate session material in one export is operator error.
6. Keep the selected account/source records in a list used by the write phase
   so validation and writing cannot diverge.

If any preflight fails, `EXPORTS_DIR` may exist but it must contain no new ZIP or
temporary archive.

**Verify**: focused successful export test remains green.

### Step 2: Use unique final and temporary paths

Create a name with both a readable UTC timestamp and a random suffix, for
example the first eight characters of `uuid.uuid4().hex`:

```text
telemanager-export-YYYYMMDD-HHMMSS-<random>.zip
```

Build to a sibling temporary path that does not end in `.zip` (for example
`.zip.tmp-<random>`), then call `temp_path.replace(export_path)` only after the
`ZipFile` context closes successfully.

Wrap creation in `try/finally`; in `finally`, unlink the temporary path if it
still exists. Do not delete the final path after a successful replace.

Use only the standard library already imported.

**Verify**: two immediate successful exports return different filenames and
both archives open successfully.

### Step 3: Add failure-cleanup regressions

Extend `tests/test_dialogs_sessions.py`:

1. **Missing later source**: create two accounts, write only the first session,
   request both, expect 400, and assert `data/exports/` contains no ZIP or temp
   file.
2. **Write failure**: monkeypatch `zipfile.ZipFile.write` (or a narrowly scoped
   helper introduced for testability) to raise after archive creation. Call the
   service directly if the route's generic handler would obscure the expected
   exception. Assert no final or temp archive remains.
3. **Same-second uniqueness**: invoke two exports without advancing time and
   assert distinct paths and valid ZIPs.
4. Existing redaction test continues proving successful content.

Use placeholder bytes such as `b"fake sqlite bytes"`; never use a real session.

**Verify**:
`PYTHONPATH=src python -m pytest -q tests/test_dialogs_sessions.py`
→ all pass.

### Step 4: Confirm outward behavior

The route must still:

- return a `FileResponse` with `application/zip`,
- use the final archive name,
- emit `sessions_exported` only after a complete archive exists,
- convert validation `ValueError` to HTTP 400.

Do not emit an audit event for failed exports unless a separate product decision
is approved.

**Verify**: inspect the existing route and add no code if it already satisfies
these conditions.

### Step 5: Run all backend gates

```bash
PYTHONPATH=src python -m pytest -q
ruff check src tests scripts
```

Expected: all pass.

## Test plan

The four cases in Step 3 are required. Tests inspect only temporary directories
provided by `app_context`; they must not read repository `data/` or `sessions/`.

## Done criteria

- [ ] All accounts and source files are validated before any archive is created.
- [ ] The final ZIP appears only after a complete successful close and replace.
- [ ] Any exception removes the temporary archive and leaves no partial final
      ZIP.
- [ ] Concurrent/same-second exports use distinct names.
- [ ] Existing metadata redaction and security README remain unchanged.
- [ ] Failed exports do not emit a success audit event.
- [ ] Full backend tests and Ruff pass.
- [ ] No files outside scope are modified.
- [ ] Plan 017 is marked DONE in `plans/README.md`.

## STOP conditions

Stop and report if:

- Session files can legitimately change identity/path between preflight and
  archive writing under an existing supported concurrent operation.
- Windows cannot atomically replace the closed temporary path with the chosen
  naming scheme.
- Correctness appears to require copying real local session data into a test.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Any future export format must preserve the same preflight → temporary build →
atomic publish contract. Reviewers should reject code that opens the final
sensitive artifact before all input validation succeeds.
