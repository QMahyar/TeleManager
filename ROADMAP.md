# ROADMAP — Full account agency

> **Temporary planning doc.** Tracks the build-out of full owned-account control:
> account/profile settings, privacy/security, contacts, chat administration, and
> messaging extras — on top of the existing dialog action queue.
> **Delete this file once every phase below is done.**

## Goal

Give the operator complete control over each owned Telegram account — not just
batch actions on its dialogs (already shipped), but the account's own settings
(profile, privacy, sessions, contacts) and administration of the chats it owns.

## Scope guardrails (non-negotiable — from AGENTS.md + safety)

- **Owned accounts only.** Everything here acts on accounts the operator controls.
- **No abuse features.** Do **not** build bulk member-add/invite, or bulk
  reactions/joins for inauthentic engagement. If a bulk form would enable spam,
  it doesn't ship.
- **High-blast-radius ops are gated or excluded.** 2FA/password change,
  phone/email change, delete-account, delete-channel: excluded from the batch
  surface; if ever added, single-account + explicit typed confirmation only.
- All live ops keep the existing invariants: hold the account session lock
  (`temp_client`/`exclusive_session` for ad-hoc; `session_guard` for runs), and
  write to the audit log.

## Architecture decision — two operation scopes

The existing action model is **dialog-scoped**: `(action_type, target dialog,
message/options)`, fanned out across accounts through the rate-limited queue.

Account settings have **no dialog target** — they act on the account itself. So
this work introduces a second scope:

- **Account-scoped operations** (Phase 1, Phase 3 privacy): direct, immediate,
  per-account. Executed via `manager.temp_client(account_id)` (holds
  `exclusive_session`), audited via `log_event`, exposed under
  `/api/accounts/{id}/...`. **Not** put through the rate-limited action queue —
  a profile edit is config, not a flood-prone bulk send.
- **Dialog-scoped operations** (Phase 2 admin, Phase 3 messaging extras): new
  `ACTION_META` rows + async impls, reusing the queue, cancel/pause, tiers, and
  audit for free.

---

## Phase 1 — Account settings panel  ✅ DONE (2026-07-02)

Account-scoped. `account_settings_service.py` + `routes/account_settings.py`
(registered in `main.py`), per-account settings modal in the web UI. Lowest abuse
risk, highest value.

**Design notes for this pass:**
- Ops run via `manager.temp_client` (holds `exclusive_session`); `_client_op`
  wraps every call and converts Telethon `RPCError` → readable `ValueError`
  (→ HTTP 400) using `classify_telegram_error`. `ValueError` (busy / unauthorized
  / not-found) passes through already-friendly.
- Session/user int64 hashes returned as **strings** so the browser can't lose
  precision and hand back a wrong value on terminate.
- Profile/username writes call `manager._refresh_account_identity` + `_save_accounts`
  so the cached account row reflects the change; each write is `log_event`-audited.
- Frontend modal fetches per-tab via `@tanstack/react-query` (the project's
  sanctioned pattern); profile edits are an overlay on the fetched baseline
  (no set-state-in-effect), so only changed fields are sent.
- **Verified:** 202 backend tests pass, ruff/tsc/eslint clean, prod build OK, and
  all 8 routes return clean 400s via TestClient. Live MTProto calls themselves are
  untested — this machine can't reach Telegram (see memory `live-telegram-unreachable-here`).

Backend (`/api/accounts/{id}/...`):
- [x] `GET  /profile` — current first/last name, bio, username
- [x] `POST /profile` — set first name / last name / bio (`account.UpdateProfileRequest`)
- [x] `POST /username` — set/clear public username (`account.UpdateUsernameRequest`)
- [x] `GET  /sessions` — list active authorizations (`account.GetAuthorizationsRequest`)
- [x] `POST /sessions/terminate` — end one session by hash (`account.ResetAuthorizationRequest`)
- [x] `POST /sessions/terminate-others` — end all but current (`auth.ResetAuthorizationsRequest`)
- [x] `GET  /contacts` — list saved contacts (`contacts.GetContactsRequest`)
- [x] `POST /contacts` — add a contact (`contacts.AddContactRequest`)
- [x] `DELETE /contacts?identifier=` — delete a contact (`contacts.DeleteContactsRequest`)
- [x] `GET  /blocked` — list blocked users (`contacts.GetBlockedRequest`)
- [x] Refresh cached account identity after profile/username change; audit every write
- [x] Self-check test for pure helpers (`tests/test_account_settings.py`)

Frontend (`components/account-settings-modal.tsx`, opened from the accounts-table Manage menu):
- [x] Per-account settings modal (Manage → Settings)
- [x] Profile form (name, bio), username field with validation + info hint
- [x] Active-sessions list with terminate / terminate-others
- [x] Contacts list (view / add / delete), blocklist view
- [x] Wired via `api()` + react-query; toasts on success/error

### Phase 1b  ✅ MOSTLY DONE (2026-07-02)

- [x] `POST /photo` set profile photo (multipart `UploadFile` → `client.upload_file`
      → `photos.UploadProfilePhotoRequest`), `DELETE /photo`
      (`get_profile_photos('me')` → `photos.DeletePhotosRequest`). 10 MB cap.
      Frontend: avatar + Change/Remove in the Profile tab.
- [x] Account self-destruct TTL — `GET/POST /ttl`
      (`Get/SetAccountTTLRequest` + `AccountDaysTTL`), validated to 30/90/180/365;
      shown as a select in the Profile tab (renders non-standard existing values too).
      Self-check: `validate_ttl_days` in `tests/test_account_settings.py`.
- [ ] Emoji status, birthday, personal channel (niche — deferred; low priority)

Verified: 202 + 4 new helper assertions pass, ruff/tsc/eslint clean, prod build OK,
14 routes smoke-tested via TestClient (clean 400s; pydantic `le=730` gives a 422 guard).

Possible follow-ups (not blocking):
- [ ] "Apply to multiple accounts" fan-out for settings (currently per-account)
- [ ] Unblock directly from the Blocked tab (today it points to the Actions screen)

## Phase 2 — Chat & channel administration  ⬜ NOT STARTED

Dialog-scoped. New `ACTION_META` rows + impls in `telegram_actions.py`.

- [ ] Create group / channel (`messages.CreateChatRequest` / `channels.CreateChannelRequest`)
- [ ] Edit chat title / photo / about (`EditTitleRequest` / `EditPhotoRequest` / `EditChatAboutRequest`)
- [ ] Export & revoke invite links (`messages.ExportChatInviteRequest`)
- [ ] Promote/demote admin (`client.edit_admin`)
- [ ] Ban / kick / restrict + default permissions + slow mode (`client.edit_permissions`)
- [ ] Get/export participant list (read-only)
- [ ] Toggle content-protection, join-requests, per-chat message auto-delete TTL
- [ ] **Guardrail:** no bulk member-add/invite form.

## Phase 3 — Privacy rules + messaging extras  ⬜ NOT STARTED

Account-scoped (privacy) + dialog-scoped (messaging).

- [ ] Privacy rules: last-seen, phone, photo, forwards, calls, group-add, bio (`account.SetPrivacyRequest`)
- [ ] Global privacy: auto-archive+mute new chats, hide read-time (`account.SetGlobalPrivacySettingsRequest`)
- [ ] Reactions (`messages.SendReactionRequest`)
- [ ] Mark-unread, read mentions/reactions
- [ ] Polls (create / vote), drafts

## Phase 4 — Chat history export  ⬜ NOT STARTED

(From the earlier clashgram review — the one borrowable feature.)

- [ ] `export_chat` action: dialog history → JSON under `data/exports/`, media optional
- [ ] Optional self-contained HTML viewer (rewritten, not copied — clashgram is GPL-3.0)

## Explicitly out of scope (won't build)

Ghost-mode / read-receipt & typing & presence suppression, anti-delete/anti-edit
capture of counterparties, premium-restriction bypass, sticker/emoji spoofing,
local premium emulation, app passcode (contradicts the local-only no-auth stance).
These are evasion / restriction-bypass / surveillance and violate AGENTS.md.
