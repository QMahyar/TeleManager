# TeleManager Improvement Plan

Implementation roadmap for priority improvements identified 2026-06-29.

## ✅ Implemented

_(None yet — tracking begins here)_

---

## 🚧 In Progress

_(Current work tracked here)_

---

## 📋 Remaining (Priority Order)

### 🔒 Must-Have (Security & Stability)

#### **#6 — Telegram Error Taxonomy + Retry Logic**
**Status**: Not started  
**Goal**: Parse Telegram error codes properly, auto-retry transient errors, show clear user guidance  
**Details**:
- Parse common error types: `FLOOD_WAIT_X`, `SESSION_REVOKED`, `PEER_FLOOD`, `CHAT_WRITE_FORBIDDEN`, `CHAT_ADMIN_REQUIRED`, `USER_PRIVACY_RESTRICTED`
- Auto-retry logic for transient errors (network timeout, `FLOOD_WAIT` < 60s)
- Clear error messages: "Session revoked. Log in again." vs "Rate limited for 45s, retrying..."
- Add to `telegram_actions.py` and queue worker

#### **#7 — Session Health Monitoring**
**Status**: Not started  
**Goal**: Track session validity proactively with visual health indicators  
**Details**:
- Background health check (ping Telegram every 6h while app runs)
- Visual badge per account: 🟢 healthy / 🟡 stale (>7d) / 🔴 revoked
- "Validate all" bulk action in Accounts screen
- Store last_validated + health_status in accounts.json

#### **#8 — Local App Password (Opt-in)**
**Status**: Not started  
**Goal**: Secure localhost access on shared/work machines  
**Details**:
- Optional password prompt on launch
- Store bcrypt hash in `data/app_settings.json`
- Middleware to check session cookie
- Settings UI to enable/disable + change password
- Logout button when enabled

---

### 🎯 High-Value Features

#### **#12 — Conditional Actions (Smart Queues)**
**Status**: Not started  
**Goal**: "Mute group IF member_count < 10", "Leave channel IF last_message_date > 90d"  
**Details**:
- Add optional `condition` field to queue step schema
- Condition DSL: `member_count < 10`, `last_message_date > 90d`, `unread_count == 0`
- Evaluate at queue-build time (filter targets) or run time (skip operations)
- UI: "Add condition" toggle in step builder

#### **#13 — Multi-Account Sync Actions**
**Status**: Not started  
**Goal**: "Copy mute/archive state from Account A to Account B"  
**Details**:
- New action type: "Sync settings" with source account + target accounts
- Fetch dialog states from source, apply to matching dialogs on targets
- Match by username/chat_id (not title — those can differ)
- UI: Dedicated "Sync" tab in Actions screen

#### **#17 — Improved Schedule UX**
**Status**: Not started  
**Goal**: Make schedules more intuitive and reduce native/runner confusion  
**Details**:
- Visual timeline preview: "Next 5 fire times: Jan 15 9am, Jan 16 9am..."
- Auto-badge: "✓ Text-only → Offline delivery" vs "⚠ Needs app running"
- "Test schedule" dry-run without creating
- Simplify recurrence form with presets: "Daily at 9am", "Every 3 hours", "Weekly on Mon/Wed"
- Better empty state on Schedules tab

---

### 🎨 UX Polish

#### **#2 — Bulk Dialog Operations Persistence**
**Status**: Not started  
**Goal**: Preserve selected dialogs across account switches and page refreshes  
**Details**:
- Store selection state in `sessionStorage` keyed by account ID
- Restore on account switch or remount
- Clear on explicit "Clear selection" or account deletion

#### **#4 — Visual Queue Diff Before Run**
**Status**: Not started  
**Goal**: Make queue preview clearer with grouping and destructive-op highlighting  
**Details**:
- Group operations by account + action type in preview
- Highlight destructive ops (delete, leave, block, clear_history) in red/orange
- Show per-account operation count: "Account A: 12 ops (3 destructive)"
- Collapsible groups for long queues

#### **#5 — Toast Notifications for Long-Running Ops**
**Status**: Not started  
**Goal**: Progress feedback for dialog fetch + queue runs  
**Details**:
- Progress toast during dialog fetch: "Fetching dialogs... 127 found"
- Progress toast during queue run: "Running queue... 8/25 complete"
- Use existing toast system, auto-update same toast (not spam)

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
