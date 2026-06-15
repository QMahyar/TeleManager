# TeleManager Product Workflow Plan

## Research Findings

Modern dashboard apps separate core workflows, edge workflows, and system/admin settings. TeleManager should not be one long page because the daily workflow is account/session operations, while API credentials, login, import/export, and destructive settings are occasional workflows.

Best-fit patterns:

- Persistent app shell with left sidebar navigation.
- Main workspace dedicated to the most-used workflow.
- Settings separated from work screens.
- Add/import/edit flows opened in drawers or modal sheets.
- Data tables for account/session/chat inventories.
- Row action menus for account-specific operations.
- Confirmation dialogs for destructive or sensitive operations.
- Per-account audit results for batch Telegram actions.

Relevant UI architecture inspired by production SaaS/admin apps and shadcn/ui:

- Sidebar: persistent global navigation with grouped sections.
- Data table: sortable/filterable account and dialog lists with row selection.
- Sheet/drawer: add account, import session, rename account, export session.
- Dialog: confirmation for logout, delete, clear chat, export session secrets.
- Dropdown menu: row-level account/dialog actions.
- Toast/activity log: immediate feedback and durable audit trail.

Telethon research notes:

- `.session` files are SQLite files containing enough authorization material to reconnect without re-entering codes.
- `StringSession` can export a portable session string, but it is highly sensitive and should be advanced-only.
- `get_dialogs()` / `iter_dialogs()` can fetch conversations per account.
- Dialog entities can be classified as users, bots, groups, supergroups, and broadcast channels.
- Entity access hashes are account-specific, so dialog/entity cache should be per account.
- Actions do not require accounts to be manually started or stopped. The app should connect, execute one action, log results, then disconnect.

## Core Product Direction

TeleManager should follow this mental model:

```text
You do not run accounts.
You own stored sessions.
You select sessions.
You run one-off Telegram commands.
The app connects, executes, logs, disconnects.
```

Replace this workflow:

```text
Start account -> keep running -> do actions -> stop account
```

With this workflow:

```text
Select account(s) -> choose action -> confirm -> execute -> disconnect -> show results
```

## Final Navigation Model

```text
Workspace
  Command Center
  Actions
  Dialogs

Management
  Accounts
  Import / Export
  Activity

System
  Settings
```

## Screens

### Command Center

Default screen for daily use.

Shows:

- Ready sessions.
- Needs attention count.
- Dialog cache status.
- Recent action results.
- Selected accounts count.
- Main account fleet table.
- Quick actions that open the Actions screen.

Does not show:

- API ID/hash form.
- Login form.
- Import/export forms.
- Start/stop account buttons.

Primary controls:

- Add account.
- Import session.
- Fetch dialogs.
- Run action.
- Validate selected.

### Accounts

Full session inventory management.

Features:

- Search accounts.
- Filter by status/source.
- Rename label.
- Rename session file.
- Validate session.
- Logout/revoke session.
- Delete local session.
- Export selected sessions.
- Fetch dialogs for selected account.

Recommended account statuses:

```text
ready
needs_login
invalid
imported_unverified
checking
busy
error
```

Avoid presenting `running` / `stopped` in the future UI.

### Add Account Workflow

Use a drawer/sheet:

```text
Step 1: Label + phone
Step 2: Telegram login code
Step 3: 2FA password if required
Step 4: Session saved as Ready
```

After login, disconnect immediately.

### Actions

One-off Telegram commands.

Supported categories:

```text
Membership
  Join group/channel
  Leave group/channel

Messaging
  Send DM
  Send group message
  Send channel message

Bots
  Start bot
  Start bot with referral/start parameter

Chat Maintenance
  Delete dialog locally
  Clear chat history locally where allowed

Discovery
  Fetch dialogs
  Resolve target/entity
```

Action builder flow:

```text
1. Select action type
2. Choose target
3. Choose account scope
4. Configure options
5. Preview
6. Confirm
7. Execute
8. Results
```

Messaging safeguards:

- Requires selected accounts.
- Requires confirmation.
- Shows message preview.
- Shows selected account count.
- Uses delay.
- Logs every result.
- Does not retry endlessly.
- Does not auto-message unknown scraped users.

### Dialogs

Fetch and categorize chats from a selected account.

Features:

- Account selector.
- Fetch dialogs button.
- Last fetched timestamp.
- Filters: all, personal, bots, groups, channels.
- Search.
- Dialog table.
- Row actions: send message, leave, delete dialog, clear history, copy target.

Dialog classification:

- User with `bot=True`: bot.
- User: personal DM.
- Chat: basic group.
- Channel with `megagroup=True`: supergroup.
- Channel with `broadcast=True`: channel.

Dialog cache location:

```text
data/dialogs/{account_id}.json
```

### Import / Export

Session portability and session inventory operations.

Import `.session` file:

1. User selects `.session` file.
2. User enters label.
3. App copies file into `sessions/`.
4. App validates it with Telethon.
5. App creates account metadata.
6. App disconnects.

Export `.session` files:

1. User selects accounts.
2. App warns that sessions are credentials.
3. User confirms.
4. App creates ZIP with sessions, metadata, and security README.

StringSession:

- Advanced-only.
- Export may use `StringSession.save(client.session)`.
- StringSession import should be delayed until secure storage strategy is decided.

Rename:

- Default rename changes display label only.
- Advanced rename can rename the session file on disk.
- File rename must validate slug, avoid conflicts, handle `.session-journal`, and update metadata.

### Activity

Audit log screen.

Features:

- Start/login/action/import/export/rename/failure events.
- Filter by account/action/status/date.
- Per-account result details.
- Export logs later.

### Settings

System/admin screen.

Sections:

- Telegram API ID/hash.
- Storage paths.
- Default action delay.
- Max batch size.
- Safety confirmations.
- Redaction preferences.
- Appearance.
- Advanced reset/cache options.

## Backend Services To Add

```text
sessions_service.py
  import_session_file()
  export_sessions_zip()
  rename_account()
  rename_session_file()
  delete_local_session()
  validate_session()
  export_string_session()

dialogs_service.py
  fetch_dialogs(account_id)
  classify_dialog(entity)
  cache_dialogs(account_id, dialogs)
  list_cached_dialogs(account_id)

actions_service.py
  run_action()
  dry_run_action()
  resolve_target()
  apply_rate_limit()

audit_service.py
  log_event()
  list_events()
  export_events()
```

## API Endpoint Plan

Accounts:

```text
GET    /api/accounts
POST   /api/accounts/login/start
POST   /api/accounts/login/code
POST   /api/accounts/login/password
PATCH  /api/accounts/{account_id}
POST   /api/accounts/{account_id}/validate
POST   /api/accounts/{account_id}/logout
DELETE /api/accounts/{account_id}
```

Sessions:

```text
POST   /api/sessions/import-file
POST   /api/sessions/export
POST   /api/sessions/{account_id}/rename-file
POST   /api/sessions/{account_id}/export-string
```

Dialogs:

```text
POST   /api/accounts/{account_id}/dialogs/fetch
GET    /api/accounts/{account_id}/dialogs
GET    /api/accounts/{account_id}/dialogs/{dialog_id}
```

Actions:

```text
POST   /api/actions/preview
POST   /api/actions/run
GET    /api/actions/results/{run_id}
```

Activity:

```text
GET    /api/activity
GET    /api/activity/export
```

Settings:

```text
GET    /api/settings
PATCH  /api/settings
```

## Data Files

```text
data/
  config.json
  accounts.json
  dialogs/
    {account_id}.json
  activity/
    events.jsonl
  exports/
    generated exports
sessions/
  account-name.session
```

All local data remains gitignored.

## Frontend Library Plan

Future Next.js frontend stack:

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Radix UI primitives.
- lucide-react.
- TanStack Table.
- TanStack Query.
- React Hook Form.
- Zod.
- Sonner.
- cmdk.
- date-fns.

Useful shadcn components:

- Sidebar.
- Button.
- Input.
- Label.
- Select.
- Checkbox.
- Dialog.
- Sheet.
- DropdownMenu.
- Tabs.
- Table.
- Badge.
- Alert.
- Sonner.
- Command.
- Separator.
- Skeleton.

Avoid external CDN scripts. The local app should work offline.

## Implementation Roadmap

1. Remove Start/Stop UX and make actions one-off.
2. Restructure the current UI into sidebar sections.
3. Add import/export/rename sessions.
4. Add dialog fetching/categorization.
5. Upgrade action workflows using dialogs as targets.
6. Prepare Next.js + shadcn migration and production hardening.
