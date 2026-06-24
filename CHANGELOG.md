# Changelog

All notable changes to TeleManager are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The canonical version lives in [`pyproject.toml`](pyproject.toml); run
`python scripts/sync_version.py` after bumping it to propagate the version.
The GitHub release body for a tag is extracted from the matching `## [VERSION]`
section below, with auto-generated commit/PR notes appended.

## [Unreleased]

## [1.9.3] - 2026-06-24

Safer concurrent sessions, and scheduling that reflects what Telegram can actually
do. Queues and schedules that touch the same account no longer collide, and the
Schedule modal now tells you up front whether a queue is delivered by Telegram
(offline) or only runs while the app is open.

### Added

- **Native media scheduling.** Scheduling a "Send media/file" step is now pre-delivered
  by Telegram server-side just like text, so scheduled photos/files arrive even while
  TeleManager is closed — previously media forced the app to stay open.
- **Action-aware Schedule modal.** Before you create a schedule, a banner states whether
  the queue is pre-delivered by Telegram (runs offline) or only runs while the app is
  open, naming the exact actions Telegram cannot pre-schedule.

### Changed

- **Per-account session safety.** A queue or schedule now holds a per-account lock for
  its whole run, so two runs touching the same account serialize instead of opening the
  same `.session` file twice. When a scheduled fire's account is busy with another run,
  the fire is skipped and recorded rather than colliding. This eliminates the
  `database is locked` errors that could appear when a schedule auto-fired during a
  manual run.
- **Per-chat scheduled-message guardrail.** When a chat reaches Telegram's limit of 100
  scheduled messages, the schedule now surfaces a clear warning instead of silently
  dropping later fires.
- **Less confusing scheduling.** The one-off "Schedule message" action is relabeled and
  points to the recurring Schedule… modal, so the two no longer feel duplicated.

### Fixed

- **"Browse" file picker under the dev server.** Selecting a file/folder no longer
  returns a 500 when running `uvicorn --reload` (Windows' `SelectorEventLoop` cannot
  spawn subprocesses); the native dialog now runs on a worker thread under any event
  loop. Packaged builds were unaffected.

## [1.9.2] - 2026-06-24

A focused cleanup of the Actions screen — the scheduler moves out of the cramped
queue rail into a dedicated modal, so the recurrence form finally has room to
breathe and the rail reads as a calm queue-and-run instrument.

### Changed

- **Scheduling moved into a focused modal.** The Actions queue rail previously
  stacked the queue, reusable queues, the safety editor, a Run/Schedule toggle,
  *and* the full recurrence form (Every / Starts / Ends / count / stagger / name /
  preview) into one ~22rem column, which overflowed into an internal scrollbar in
  Schedule mode. The rail is now a compact queue + **Run** + **Schedule…**; the
  recurrence form opens in a dedicated modal where it lays out two-up. Arriving
  from Dialogs "Schedule selected" opens the modal directly. The schedule
  create/preview payloads are unchanged.
- **Queue rail declutter.** Removed the duplicate operation count from the queued-
  steps table header (the rail's console readout already states operations and
  steps directly above it).

## [1.9.1] - 2026-06-24

A correctness fix for how group and channel ids are stored, plus a visual pass
over the Accounts and Actions screens.

### Fixed

- **Group/channel ids are normalized to their marked form.** The dialog cache
  stored Telethon's bare `entity.id`, so a username-less group or channel was
  targeted by an ambiguous positive id that the session cache (keyed by the
  marked id) could not resolve — and the resolver could only ever try the user
  interpretation of it. Ids are now stored marked: `-100…` for channels and
  supergroups, `-id` for basic groups. Legacy dialog caches are migrated to the
  marked form on read (using the chat type already stored alongside), so existing
  dialog lists self-heal without a re-fetch. Hand-typed bare/raw ids are still
  accepted by the action resolver.

### Changed

- **Accounts & Actions screens.** A shared "console readout" instrument — a
  hairline-ruled strip with a status signal light — replaces the KPI-tile rows.
  Accounts opens with a single fleet readout (removing the fleet counts that were
  duplicated against the sidebar), and the Actions queue panel reads as an arming
  console: an armed/destructive state readout plus always-visible safety
  interlocks (account/action delays and the operation cap), with the full editor
  one click away under "Adjust".

## [1.9.0] - 2026-06-23

Operator-console refinement. The "Console" theme stays, but the shell now reads
like a real desktop application — a persistent footer status bar, a clearer
button and type hierarchy, and a cross-screen view of what the queue is doing —
alongside a normal-user clarity pass over every screen. Also fixes a real
multi-account bug in guarded actions.

### Added

- **Footer status bar.** A persistent bottom status line shows the local
  connection (`127.0.0.1`), the app version, and a live `running N/M` pulse while
  a queue executes — visible from every screen. Refresh and the theme toggle move
  here from the sidebar foot. Run-polling was lifted to app state so the pulse
  (and the rail's live progress) work no matter which screen is open.

### Changed

- **The shell reads like an application.** The layout is now a flex column with
  internally-scrolling panes so the footer stays pinned; each screen sits on a
  recessed "well" with one raised focal panel to land the eye.
- **Button & type hierarchy.** A comfortable 36px tier marks the single primary
  action per view (Run, Send code, Fetch live, Use in Actions, Import/Export,
  Save…); everything else stays dense, and inputs grow to match. Section eyebrows
  and per-panel icon chips are restrained — kept only where a real 1→2 sequence
  exists (Login, Dialogs).
- **Normal-user clarity pass.** Plain language over operator jargon and a
  consistent label/button hierarchy across screens. The right rail slims to
  **Activity** (Queue + Last run); duplicated fleet-health and schedule counts
  were removed. Renames: Live→Activity, Fleet→Accounts, Watch→Attention,
  Ops→Operations. The `Field` label's uppercase styling is scoped so it no longer
  leaks into target hints and helper text.
- **Activity rail.** "Last run" shows the outcome and a relative time
  (e.g. `2/2 · 4m ago`) plus a live progress bar, instead of a raw run UUID.
- **Dialogs & Accounts tables.** One **Use** button plus a single overflow menu
  per dialog row; numeric-id targets are tagged; variable bulk verbs fold behind
  one **Bulk actions** menu. Accounts collapse per-row controls into a **Manage**
  menu so the fleet table fits without horizontal scroll.
- **Actions builder.** Three columns become two — the accounts column is now a
  collapsible **Run as** selector in the builder, and presets move into the queue
  panel — with a single filled primary action.

### Fixed

- **Multi-account actions on username-less chats.** A chat picked from one
  account's list is stored as a numeric id, which only resolves on accounts that
  already have that peer cached — so a queue across many accounts ran on just the
  source account. Each account now primes its own dialog cache once on a numeric
  cache-miss and retries, so every account that is a member of the chat resolves
  it; non-members get a clearer error, and a flood-wait while priming still backs
  the queue off. Adds regression tests.

### Internal

- Version bumped to 1.9.0 throughout (`pyproject.toml`, `package.json`,
  `README.md`, `__init__.py`).

## [1.8.1] - 2026-06-22

Housekeeping release — dead code removal and a contributor-friendly repo guide.

### Added

- **AGENTS.md repo guide.** A concise, essential orientation for agents/contributors
  covering TeleManager's local-only constraints, repo layout, dev/build/test commands,
  and versioning/release conventions. **CLAUDE.md** is a one-line `@AGENTS.md` import
  so Claude Code and AGENTS-aware tools share one source of truth.

### Removed

- **Dead code drop (YAGNI pass).** Removed `Metric` component, `validateTargets()`,
  `ResolvedTarget` type, `resolve-target` route, queue/preview endpoint and helpers,
  singular session import route, and the `FILE_BODY` helper. Net **-170 LOC**.
  Affected tests repointed onto the still-live `expand_action_queue` and batch import
  so coverage is preserved.

### Internal

- Version bumped to 1.8.1 throughout (`pyproject.toml`, `package.json`, `README.md`,
  `__init__.py`).

## [1.8.0] - 2026-06-22

Visual redesign. TeleManager moves to a single, cohesive **"Console"** theme — a
dark-first, warm-charcoal operator's console with a monospace "machine voice" and a
dim-teal signal. The wolf mascot introduced in 1.7.0 is retired in favour of a quieter
terminal-prompt mark. This is a re-skin of the shared token and primitive layer, so
every screen updates together; behaviour and APIs are unchanged.

### Changed

- **"Console" theme.** Warm-charcoal neutrals (OKLCH) replace the cool slate, with a
  dim **teal** as the default accent. Hairline borders, flatter cards, and a slimmer
  command-bar header replace the boxed header. Light mode is fully retuned to match,
  and the app now defaults to dark.
- **Monospace-led typography.** JetBrains Mono Variable now sets headings, labels, and
  all machine data — session filenames, account IDs, phone numbers, the `127.0.0.1`
  bind, and stat numbers; Inter remains for prose. Heading sizes are smaller and calmer.
- **Stat tiles** read as an instrument cluster: monospace numerals and a teal left-tick
  on the active/primary tile instead of a filled colour wash.
- **Accents.** Teal is the new default; **Moonlight** (the former azure default),
  **Amber**, **Arctic**, and **Emerald** remain selectable in Settings → Appearance,
  with cleaned-up labels and a swatch preview.

### Removed

- **The wolf mark.** The animated wolf SVG, its sidebar lockup, the Settings preview
  ("the wolf's eyes follow your accent"), the `wolf-eye` keyframe, and the wolf favicons
  are gone. The brand is now a small terminal-prompt glyph. **Noto Serif** is dropped.

### Internal

- `globals.css` rewritten with the warm-charcoal + teal token system (light and dark),
  a new `--font-mono`, and `--font-heading` pointed at JetBrains Mono. New
  `components/brand-mark.tsx`; `components/wolf-mark.tsx` deleted. Default mode (dark)
  and default accent (`teal`) set in `theme-provider.tsx` and the pre-paint script in
  `index.html`. New dependency `@fontsource-variable/jetbrains-mono`. Typecheck, lint,
  and the production build pass.

## [1.7.0] - 2026-06-22

Production-polish release. A tighter, denser layout app-wide; path fields can now
open a **native OS file/folder picker**; the Scheduled inspector **discovers** what
each account has scheduled instead of making you type it; and the app gains a real
visual identity — an animated wolf mark and four selectable accent palettes in both
light and dark.

### Added

- **Native "Browse" picker on path fields.** Path inputs (e.g. `send_media`'s file)
  keep free-text entry but gain a **Browse ▾** control that opens a real operating-system
  dialog and fills the absolute path — something a browser `<input type=file>` cannot do.
  The split menu offers **Pick file** _and_ **Pick folder** on every path field. A new
  `POST /api/system/pick-path` drives the dialog: PowerShell WinForms on Windows (works
  in the frozen build, which excludes tkinter), `osascript` on macOS, and zenity/kdialog/
  tkinter on Linux. Hosts without a native picker get a friendly toast and keep typing.
- **Automatic Scheduled inspector.** Opening the inspector now **scans every account**
  and lists the chats that actually have scheduled messages — no more typing an account
  and chat by hand. Results group by **account → chat** with per-chat counts and an
  owned-vs-manual split (TeleManager-created vs. messages you scheduled in Telegram),
  a filter (all / owned / manual), per-chat **Clear**, per-account **Clear all**, and
  **delete-selected**. The account→chat map is derived from the app's own
  `schedules.json` (Telegram exposes no global "everything scheduled" API). A collapsible
  **Check another chat** block keeps the old manual lookup for chats not in any schedule.
  New `GET /api/scheduled/overview`.
- **Appearance settings + four accent palettes.** Settings → **Appearance** adds a
  theme-mode control (System / Light / Dark) and four selectable accents —
  **Moonlight** (azure, default), **Amber**, **Arctic**, and **Emerald** — each tuned for
  contrast in both modes, with a live preview. The choice persists to `localStorage` and
  is applied **before first paint** (inline boot script) so there's no theme flash on load.
- **Animated wolf mark.** A new geometric 2D wolf-head SVG replaces the old "TM" box in
  the sidebar and ships as the browser-tab favicon. Its eyes follow the active accent and
  pulse gently (disabled under `prefers-reduced-motion`).

### Changed

- **Density pass across the whole app.** Tightened the shared primitives — table cell
  padding, form field/Input/Select heights, badges, panels, and metric tiles — plus the
  Accounts table (single-line identity rows, condensed mobile cards). The result is a
  noticeably denser, calmer layout. Touch targets are unaffected: the existing
  `@media (pointer:coarse)` rules still bump controls to comfortable sizes on touch.
- **Cool-slate neutral base.** The warm-grey palette is replaced by a clean cool-slate
  neutral in both light and dark, giving the accents a cleaner ground to sit on.

### Internal

- New backend module `file_picker.py` (OS-aware `pick_path`, module-level lock so two
  dialogs can't open at once, ~5-minute timeout). New `components/wolf-mark.tsx` and a
  reusable `PathInput` primitive. The accent system lives in `theme-provider.tsx`
  (`data-accent` attribute + `useAppliedAccent`), with palette overrides and a
  `wolf-eye` keyframe in `globals.css`. `Menu` gained `triggerProps` so a dropdown can
  use a labelled (non-icon) trigger. New tests: `test_file_picker.py` (pick-path endpoint
  incl. the 501/409 paths) and `test_scheduled_overview.py` (overview grouping + an
  unreachable account).

## [1.6.0] - 2026-06-21

Workflow consolidation release. One-off runs and recurring schedules now share a
single **Actions** page, Dialogs quick actions execute in place, and importing
sessions is a near-zero-friction batch operation.

### Fixed

- **Multi-account queues/schedules now run on every selected account.** Handing
  chats off from Dialogs into Actions or Schedules replaced the account selection
  with the single dialog "source" account, so queues built that way silently
  collapsed to one account. The handoff now _unions_ the source account into the
  existing selection instead of overwriting it. Verified end-to-end: a two-account
  send now delivers from both accounts.

### Added

- **In-place quick actions on Dialogs.** The row 3-dot menu (and the bulk action
  buttons) now _run_ the chosen action on the fetched account instead of only
  staging it into the builder. Parameterless actions (mute, archive, read, leave…)
  run in one tap; destructive ones confirm first; actions that need input (send
  message, forward, schedule, ids…) open an inline mini-prompt that reuses the
  builder's structured form, then run. Results are toasted and recorded in run
  history.
- **Automatic batch import.** Import / Export now accepts **many** `.session`
  files at once (pick or drag-and-drop), validates each, and **auto-names** every
  account to its real Telegram name (username, else first+last), falling back to
  the filename. No labels to type.
- **Schedule mode inside Actions.** The Queue & run column has a **Run now /
  Schedule** toggle; "Schedule" turns the same built queue into a recurring
  schedule (cadence, start/end, stagger, preview) without rebuilding it.

### Changed

- **Schedules merged into Actions.** The standalone Schedules screen is gone; its
  active-schedules list and the Telegram scheduled-message inspector are now tabs
  beneath the Actions builder (Run history / Schedules / Scheduled inspector).
  Old `#schedules` deep-links redirect to Actions. The nav drops from five items
  to four.

### Internal

- New shared `lib/queue-run.ts` (`startQueueRun` / `awaitQueueRun`) powers both
  the Actions run banner and the in-place quick-action runner. Schedule
  presentation pieces extracted to `components/schedule-parts.tsx`
  (`RecurrenceFields`, `SchedulePreviewCard`, `ScheduleCard`); new
  `components/quick-action-runner.tsx`. Backend adds
  `POST /api/sessions/import-files` and a `display_name_from_account` helper; the
  former standalone `schedule-builder.tsx` and `schedules-screen.tsx` are removed.

## [1.5.0] - 2026-06-21

Frontend refresh and polish pass. Keeps the existing dense, green identity and
layout; no backend or API changes.

### Added

- **Toast tones**: feedback toasts are now coloured by outcome — success (green), error (red, with `role="alert"` / `aria-live="assertive"` so screen readers interrupt), and info — each with an icon, so a failed request no longer looks identical to a success.
- **Command-palette actions**: Ctrl+K lists app actions (Add account, Refresh data, Switch theme) alongside screen navigation, and the palette now closes when you pick something.
- **Clickable fleet stats**: the Accounts metric tiles (Total / Ready / Needs attention) double as one-tap status filters, including a new roll-up "Needs attention" filter that matches every not-ready session.
- **Loading skeleton** for the Accounts table's first load instead of a brief flash of the empty state.

### Changed

- **Context-aware header**: "Add Account" now deep-links straight to the Add / Login tab (previously it landed on the Fleet tab), and the "N selected" chip only shows on the Accounts screen, where it actually reflects the session selection.
- **Row action menus** (Accounts, Dialogs) are proper dropdowns that close on outside-click and Escape and expose `aria-haspopup` / `aria-expanded`, replacing native `<details>` menus that stayed open.
- **Modals share one implementation** with a focus trap, body scroll-lock, and Escape handling (command palette, confirm/prompt dialog, message inspector, run details), so keyboard focus no longer escapes an open modal.
- **Subtle visual refresh** that preserves the dense green identity: a gentle corner radius and card elevation, a green focus ring across inputs/selects/textareas, and consistently rounded cards, tiles, chips, and list rows.

### Fixed

- The Accounts dialog picker no longer calls `setState` inside an effect (which could trigger cascading re-renders); the active account is now derived from props/state.

### Internal

- New shared UI primitives: `Modal` + `useFocusTrap`, `Menu` (controlled dropdown), and `Skeleton` / `StatCard`.
- `flash()` gained an optional `tone` parameter (shared `Flash` type) threaded through screen props; removed the unused `--chart-*` design tokens.

## [1.4.0] - 2026-06-21

### Added

- **Standalone schedule builder** on the Schedules page: create a recurring schedule end-to-end (accounts, action, target chats, message, recurrence) without going through the Actions queue builder.
- **Start options** for schedules: begin after one interval, after a delay (e.g. +1h), or at a specific time.
- **Cross-chat stagger** toggle so identical messages to multiple chats don't all fire at the same instant.
- **Fully-offline indicator** in the schedule preview when the entire series fits Telegram's 100-per-chat buffer (pre-scheduled all at once, no reopen needed).
- **Scheduled-message inspector**: pick an account + chat to list what Telegram actually has scheduled (marking TeleManager-created vs manual messages) and clear selected or all — `GET/POST /api/accounts/{id}/scheduled`.
- **Action-aware chat picker**: "Pick from chats" now greys out and disables chats that can't take the selected action (e.g. Block user hides groups/channels), flags chats already in the target list, adds a kind filter (Users / Groups / Channels / Bots), a "Select compatible" bulk-pick, and live compatible/added counts — so only valid targets can be added.
- **Edit and duplicate queued steps**: a queued action step can be loaded back into the builder to tweak and re-add, or duplicated in place (previously steps could only be removed).
- **Multi-step schedules**: the schedule builder can hold several action steps and seed them from a saved Actions preset (Load from preset), instead of being limited to a single action.

### Changed

- Workspace navigation reordered to Dialogs → Actions → Schedules.
- Scheduling moved out of the Actions screen into the dedicated Schedules page.
- **Account selection now flows between screens**: Command Center "Run Action" / "Fetch Dialogs" carry the selected ready sessions into Actions / Dialogs, and every Dialogs → Actions handoff pre-selects the dialog's account so the builder no longer blocks on "select an account".
- Activity audit log is now capped (most recent 5,000 events) instead of growing without bound.

### Fixed

- `fetch_messages` / `resolve_target` now check authorization live (via a shared short-lived client) instead of trusting a possibly-stale flag, so revoked sessions return a clear message.
- Target-preview warnings render in amber instead of error-red.
- Chat picker showed "No chats loaded" on first open until the account was re-selected — it resolved the account before the account list had loaded.
- Chat picker defaulted to the first ready account instead of the one chosen for the action when multiple accounts were ready.

### Internal

- Run history shows a "scheduled" badge on runs started by a schedule.
- Deduplicated target classification (one shared `analyzeTarget`), folded dialog reads onto a single `temp_client` helper, centralized `now_iso`, and removed dead code (`audit_service.get_event`).

## [1.3.0] - 2026-06-20

### Added

- **Recurring schedules**: turn any built action queue into a repeating schedule (every N minutes/hours/days, ending after a set number of times, on a date, or never).
- **Automatic delivery engine** per schedule: text-only schedules (plain messages and a plain `/start`) are pre-loaded as Telegram-native scheduled messages and keep firing while TeleManager is closed; all other actions run via the in-app queue runner while the app is open.
- **Rolling native buffer** that respects Telegram's 100-scheduled-messages-per-chat (365-day) limit and refills whenever the app is running.
- New **Schedules** screen and a "Schedule this queue" path in the Actions builder, with preview, pause/resume, run-now, and delete (deleting a native schedule also removes the messages it pre-scheduled).
- Background `SchedulerService` started/stopped with the app lifespan; queue runs created by a schedule are tagged with `schedule_id`.
- **`/api/schedules`** endpoints (preview, create, list, get, patch, run-now, delete) and a new `data/schedules.json` store.

## [1.2.0] - 2026-06-19

### Added

- **About page** with version display, update checker (compares against GitHub latest release), author socials, and crypto donation addresses. Accessible from the sidebar under System.
- **`GET /api/version`** endpoint exposing the running version.
- **`GET /api/updates/check`** endpoint that fetches the latest GitHub release and performs semver comparison from the server side (avoiding browser CORS/rate-limit issues).
- Version single-sourcing now includes `src/telemanager/__init__.py` (`__version__`) as a synced derived file alongside `package.json` and `README.md`.
- GitHub Release title now explicitly set to `TeleManager vX.Y.Z` instead of just the tag name.

## [1.1.0] - 2026-06-19

### Added

- 15 Telegram action operations with target validation and a guarded multi-account queue workflow.
- Dialog quick actions and tolerant multi-account execution.
- Bot referral links and redesigned frontend UX.
- Local PyInstaller packaging for Windows/Linux/macOS (amd64 + arm64) and a Termux arm64 source package.
- Single-source versioning (`pyproject.toml` → `package.json`/README via `scripts/sync_version.py`).

### Fixed

- Release build and Telethon connection handling.
- Windowed (console-less) build crash: `Unable to configure formatter 'default'` caused by `sys.stdout`/`sys.stderr` being `None` under PyInstaller `console=False`.
- Termux package failing to import `telemanager` (package under `src/` was not on `PYTHONPATH`).

### Changed

- Simplified app structure; removed legacy static UI in favor of the React/Vite SPA.
- End-to-end UI polish across shell, accounts, sessions, dialogs, and run history.
- Build script auto-skips the pip reinstall when PyInstaller is already on PATH.

## [1.0.0] - 2026-06-18

### Added

- Initial TeleManager app: local Telethon `.session` creation, validation, import/export, and audit trail.
- React frontend (Vite, Tailwind) served as a FastAPI SPA.
- Guarded one-off action queues with conservative rate limiting and a local audit trail.
