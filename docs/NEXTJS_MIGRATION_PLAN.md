# Next.js + shadcn/ui Migration Plan

This migration is optional and intentionally deferred. The current static FastAPI UI should remain the source of truth until real Telegram testing and automated tests are passing.

## Recommended Decision

Do not migrate yet. Finish hardening the current app first:

- Run the manual checklist with owned Telegram sessions.
- Install dev dependencies and pass the pytest suite.
- Add mocked Telethon tests for network-facing workflows.
- Resolve any UX issues discovered during real queue runs.

## Target Architecture If Migrated

```text
Next.js frontend
  -> FastAPI local API backend
    -> TeleManager services
      -> Telethon
      -> local data/ and sessions/
```

FastAPI should remain the local backend because it already owns Telethon integration, local file paths, session imports/exports, and queue execution.

## Migration Scope

A future migration would replace only `src/telemanager/static/` with a Next.js app:

- Sidebar app shell
- Accounts page
- Actions queue builder
- Dialog fetch/search/selection page
- Import/export page
- Activity and run history views
- Settings and safety defaults
- In-app modal/confirmation system

The Python backend routes should stay stable during the migration.

## shadcn/ui Component Mapping

- App shell: `Sidebar`, `Sheet`, `ScrollArea`
- Cards/panels: `Card`
- Forms: `Form`, `Input`, `Textarea`, `Select`, `Checkbox`, `Button`
- Tables: `Table`, `Badge`, `DropdownMenu`
- Modals: `Dialog`, `AlertDialog`
- Feedback: `Toast`, `Progress`, `Skeleton`
- History actions: `DropdownMenu` or compact button group

## Risks

- Adds Node build tooling and frontend dependency management.
- Can slow down local-only development if API and UI dev servers drift.
- Risks reintroducing generic UI before the workflow is fully validated.
- Requires careful handling of file upload/download APIs for session import/export and run exports.
- Does not solve Telegram-specific correctness; tests and manual validation matter more first.

## Migration Steps Later

1. Freeze current API contracts with tests.
2. Create a separate frontend app directory.
3. Build typed API client wrappers for existing FastAPI routes.
4. Port read-only pages first: Command Center, Activity, Run History.
5. Port stateful flows next: Settings, Accounts, Dialogs.
6. Port Actions queue builder last.
7. Keep the old static UI available until parity is verified.
8. Remove static UI only after manual Telegram testing passes on the migrated frontend.

## Go / No-Go Criteria

Proceed only if:

- The current static app workflow is confirmed with real sessions.
- Automated tests pass consistently.
- The user explicitly wants the larger frontend investment.
- The migration can preserve local-only behavior and avoid exposing sensitive data.
