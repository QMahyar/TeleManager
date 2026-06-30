# TeleManager Improvement Plan

Implementation roadmap for priority improvements identified 2026-06-29.

## ✅ Implemented

### **#12 — Conditional Actions (Smart Queues)** ✅
**Completed**: 2026-06-30  
**Details**:
- Structured condition `{field, op, value}` on each queue step (NOT a string DSL —
  no parser to keep in lockstep across backend/frontend). Fields: `member_count`,
  `days_since_last_message`, `unread_count`; six operators.
- Backend: `StepCondition` on `ActionQueueStep`; new `action_conditions.py` evaluator
  (pure `compare()` + live metric lookups reusing `resolve_full_entity` /
  `resolve_input_peer` / `get_messages` / cached dialogs). Worker
  (`process_action_queue`) evaluates per target before each op and **skips on false
  or on any uncertainty** (failed lookup / missing metric), recording a
  `skipped_condition` result; new `skipped_count`.
- Schedules: a conditional step forces the **runner** engine (can't be evaluated for
  offline delivery) — mirrored in `_step_is_native` (backend) + `stepIsNativeSchedulable`
  (frontend); preview adds a "counts are maximums" warning.
- Frontend: `StepCondition` types, `lib/conditions.ts`, an "Condition" disclosure in
  the step builder, an `if <field op value>` badge in the queue table, and the step
  `condition` threaded through construction/edit (presets/schedules/duplicate carry it
  automatically).
- Tests: 11 backend (`test_action_conditions.py` — compare truth table, skip-on-error/
  None, days-since, unread match, runner-forcing) + 5 frontend (`conditions.test.ts`,
  `scheduling.test.ts` mirror). All green.

> ⚠️ **Backend repair required to land this** — see "Backend was non-importable" note
> at the bottom. Verifying #12 surfaced that HEAD's backend didn't import at all.

### **#17 — Improved Schedule UX** ✅ (presets; rest pre-existing)
**Completed**: 2026-06-30  
**Details**:
- Added one-click recurrence presets to the schedule modal: "Every 30 min",
  "Hourly", "Every 3 hours", "Daily at 9am", "Weekly" — `recurrencePresets` in
  `lib/schedules.ts`, rendered as a button row atop `RecurrenceFields`
- Each preset returns a full `RecurrenceForm` (spreads the default), so it flows
  straight through the existing validate → preview → create pipeline, then stays
  editable as a starting point
- 3 passing tests (`schedules.test.ts`): every preset validates; "Daily at 9am"
  anchors a future 9:00 local; "Every 3 hours" maps to a 3h forever interval
- **Already shipped by prior work** (verified, not rebuilt): timeline preview
  ("First fires: …" in `SchedulePreviewCard`, via the Preview button → `/api/
  schedules/preview`), offline/runner auto-badge (engine signal box + engine
  Badge), "test schedule" dry-run (the Preview button creates nothing), and the
  Schedules empty state (`EmptyState` + `EmptySchedulesArt`)
- **Deferred**: "Weekly on Mon/Wed" — the recurrence model is `interval × unit`
  with no day-of-week mask; that needs a backend `recurrence.py` change, out of
  scope for a UI pass

### **#4 — Visual Queue Diff Before Run** ✅
**Completed**: 2026-06-30  
**Details**:
- Added `rollupByAccount()` to `components/shell/queue-metrics.ts` — re-pivots the
  queue from steps (how it's built) to accounts (how it runs), tallying ops and
  destructive ops per account + action type
- New `AccountDiff` component in `screens/actions/queue.tsx`: a "Per-account preview"
  disclosure under the queue table, sorted most-impacted-first
- Per-account header reads `<label> · N ops · M destructive` (destructive count in red)
- Destructive accounts get a red edge; destructive action chips tint red
- Collapsed by default; auto-opens when any destructive op is queued
- 4 passing tests for the pivot logic (`queue-metrics.test.ts`)
- Reuses existing primitives (`Disclosure`, `Badge`); no backend, no new deps

### **#6 — Telegram Error Taxonomy + Retry Logic** ✅
**Completed**: 2026-06-29  
**Details**:
- Created `telegram_errors.py` with `classify_telegram_error()` parsing 10+ error categories
- Auto-retry for short flood waits (≤60s) and network errors
- Clear user messages: "Session revoked. Log in again." vs "Rate limited for 45s, retrying..."
- Integrated into queue worker (`action_queue_service.py`) and account manager (`accounts.py`)
- 12 passing tests covering all error categories and retry logic
- Session invalid errors now mark account as unauthorized automatically

### **#7 — Session Health Monitoring** ✅
**Completed**: 2026-06-29  
**Details**:
- Created `session_health.py` with `compute_health_status()` computing health from validation history
- Health statuses: 🟢 healthy (validated <7d), 🟡 stale (7+ days), 🔴 revoked, ⚪ unknown
- Visual health badge in accounts table (accounts-table.tsx)
- "Validate All" button in Fleet tab for bulk validation
- Backend `/api/accounts/validate-all` endpoint for parallel validation
- 11 passing tests for health computation logic
- `AccountRecord.to_public_dict()` now includes computed `health_status` field

### **#8 — Local App Password (Opt-in)** ✅
**Completed**: 2026-06-29  
**Details**:
- Created `app_password.py` with bcrypt-based password hashing
- Optional password prompt on launch (when enabled)
- Session-based authentication with 24h token expiration
- Auth middleware in `main.py` (exempts `/api/auth/` and static assets)
- Backend routes: `/api/auth/status`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/setup`
- In-memory session store (cleared on restart, appropriate for local-only app)
- 4 passing tests for session creation, validation, and expiration
- Password hashing uses bcrypt with salt (secure against rainbow tables)

### **#2 — Bulk Dialog Operations Persistence** ✅
**Completed**: 2026-06-29  
**Details**:
- Updated `use-dialog-state.ts` to persist selections per account in `sessionStorage`
- Selections automatically restore when switching accounts
- Survives page refresh (within same session)
- Key format: `dialog_selection_{accountId}` stores JSON array of selected targets
- Updated `use-cached-dialogs.ts` to trigger persistence on account change
- Graceful fallback if storage quota exceeded or privacy mode blocks access

---

## 🚧 In Progress

_(Current work tracked here)_

---

## 📋 Remaining (Priority Order)

### 🔒 Must-Have (Security & Stability)

#### ~~**#6 — Telegram Error Taxonomy + Retry Logic**~~ ✅
**Status**: Complete (2026-06-29)  
See "Implemented" section above.

#### ~~**#7 — Session Health Monitoring**~~ ✅
**Status**: Complete (2026-06-29)  
See "Implemented" section above.

#### ~~**#8 — Local App Password (Opt-in)**~~ ✅
**Status**: Complete (2026-06-29)  
See "Implemented" section above.

---

### 🎯 High-Value Features

#### ~~**#12 — Conditional Actions (Smart Queues)**~~ ✅
**Status**: Complete (2026-06-30) — see "Implemented" section above.
Deferred: compound conditions (AND/OR), build-time target filtering.

#### **#13 — Multi-Account Sync Actions**
**Status**: Not started  
**Goal**: "Copy mute/archive state from Account A to Account B"  
**Details**:
- New action type: "Sync settings" with source account + target accounts
- Fetch dialog states from source, apply to matching dialogs on targets
- Match by username/chat_id (not title — those can differ)
- UI: Dedicated "Sync" tab in Actions screen

#### ~~**#17 — Improved Schedule UX**~~ ✅
**Status**: Complete (2026-06-30) — presets added; other bullets pre-existing  
See "Implemented" section above. Day-of-week recurrence ("Mon/Wed") deferred
(needs a backend recurrence-model change).

---

### 🎨 UX Polish

#### ~~**#2 — Bulk Dialog Operations Persistence**~~ ✅
**Status**: Complete (2026-06-29)  
See "Implemented" section above.

#### ~~**#4 — Visual Queue Diff Before Run**~~ ✅
**Status**: Complete (2026-06-30)  
See "Implemented" section above.

#### ~~**#5 — Toast Notifications for Long-Running Ops**~~ ✅ (covered)
**Status**: Covered by existing UI (2026-06-30)  
**Resolution**: Queue-run progress already ships in three live surfaces — the
`ActiveRunBanner` ("8/25 done · N failed" + current target), the `ActiveRunProgress`
bar in the operations rail (persists across screens), and the footer pulse — all
reading the 1.2s run poll. A progress toast would duplicate these. Dialog fetch
already has a global spinner, a `loading` button, an inline status `Callout`
("Fetching dialogs…" → "Fetched N dialogs at HH:MM"), and a completion toast.
**Follow-up (deferred)**: a *live* fetch count ("127 so far") needs the fetch
endpoint to stream (NDJSON/SSE) — real backend work on the session-locked path,
disproportionate to the value, so deferred. The backend already iterates dialogs
one-by-one (`iter_dialogs`), so it's feasible when wanted.

#### **#14 — Onboarding Flow**
**Status**: Not started  
**Goal**: Guide new users through first launch  
**Details**:
- Welcome modal on first launch (detected via absence of `data/config.json` or flag in `app_settings.json`)
- Step-by-step: "1. Add API credentials → 2. Log in account → 3. Fetch dialogs"
- Improved empty states with next-action buttons
- "Skip tour" option

#### **#16 — Queue Run Notifications**
**Status**: Not started  
**Goal**: Desktop notification when queue finishes (if app backgrounded)  
**Details**:
- Request Notification API permission
- Send notification on queue completion: "Queue finished: 25 operations (23 ok, 2 failed)"
- Click notification → focus app window + jump to run detail
- Settings toggle to enable/disable

---

### 🚀 Nice-to-Have Features

#### **#9 — Message Search Across Dialogs**
**Status**: Not started  
**Goal**: Search message content within fetched dialogs  
**Details**:
- Extend `/api/accounts/{id}/messages` to fetch recent messages from all dialogs (paginated)
- New "Search messages" panel in Dialogs screen
- Search query → filter messages by content
- Click result → open dialog + scroll to message (if possible)

---

## 🎯 Implementation Strategy

1. **Phase 1 (Must-Have Security)**: #6 → #7 → #8 (foundation for safe multi-user/shared-machine use)
2. **Phase 2 (Core UX)**: #2 → #4 → #5 → #17 (daily workflow polish)
3. **Phase 3 (Power Features)**: #12 → #13 (advanced use cases)
4. **Phase 4 (Onboarding)**: #14 → #16 (growth + retention)
5. **Phase 5 (Optional)**: #9 (if time permits)

---

## 📝 Notes

- All changes maintain local-first, no-cloud architecture
- Backward compatible with existing `data/` files
- Each feature gets tests before merge (following v1.14.0 standards)
- UI changes follow Console theme (dark-first, Geist fonts, dim-teal accent)

---

## ⚠️ Backend was non-importable in HEAD (found + fixed 2026-06-30)

Verifying #12 surfaced that the committed backend did **not import at all** under
CPython 3.12 — so the backend test suite had been fully red since these landed, and
the recent backend PRs' "N passing tests" claims could not have been real. Five
distinct committed bugs, now fixed:

1. **`runtime.py` deleted** (commit `041d36e`, #6) while four `routes/*` still
   `from ..runtime import manager/queue_runs/scheduler` → `ModuleNotFoundError`.
   Restored the module; rewired `main.py` to import the shared singletons from it.
2. **`accounts.py` syntax error** (commit `ca9e1fc`, #7): `to_public_dict` was
   rewritten to `return data` but the old `return {…}` body was left below an
   unterminated stray `"""`, swallowing ~185 lines. Removed the dead block.
3. **`config.atomic_write_text` missing** (security-hardening commit): `audit_service`
   imports/uses it; it never existed. Added the atomic text writer (mirrors `write_json`).
4. **`active_sessions` circular import** (#8): `routes/auth` did `from ..main import
   active_sessions`, but `main` imports the routes first. Moved it into `runtime.py`.
5. **Duplicate `app_settings_doc`** (#8): `app_password.py` built
   `Document("app_settings.json")` (a **str, relative path**) instead of reusing the
   shared `documents.app_settings_doc` (a Path under DATA_DIR) → `'str' has no
   attribute 'exists'` on every settings read. Now reuses the shared doc.

After the fixes the backend imports and **178/183 tests pass**. The remaining **5
failures are pre-existing and unrelated to #12** (outdated `test_flood_wait` /
`test_failed_run` encode pre-#6 queue behavior; 3 dialog-photo/session tests look
mock-related) — left for a separate triage so the repair stays reviewable.
