# Real Telegram Test Checklist

Use only Telegram accounts you own and chats where you have permission to test. Do not commit phone numbers, API hashes, target usernames, exported ZIPs, `.session` files, or screenshots containing private data.

## Before testing

- Confirm the app is running on `127.0.0.1` only.
- Confirm `data/`, `sessions/`, `.session`, `.env*`, and `AGENTS.md` are ignored by Git.
- Use 1-2 owned test accounts and low-risk private test chats.
- Keep queue limits conservative: 4 seconds between accounts, 8 seconds between actions, max 100 operations or lower.

## Sessions

- Save API ID/hash in Settings and verify the hash is not displayed back in full.
- Log in a fresh account and confirm it appears ready and usable.
- Import a copied `.session` file with a label and confirm it creates an account record.
- Rename the account label and confirm it persists after refresh.
- Rename the session file and confirm the account still validates.
- Export one session as ZIP and confirm it contains `sessions/*.session`, `accounts-export.json`, and `README-SECURITY.txt`.
- Confirm exported metadata redacts phone numbers by default.
- Delete a disposable local session and confirm the account and `.session` file are removed.

## Dialogs

- Fetch dialogs for one ready account.
- Confirm groups, supergroups, channels, bots, and personal DMs are categorized correctly enough for targeting.
- Refresh the page and confirm cached dialogs still display without another Telegram fetch.
- Select multiple dialogs and copy them into Actions.
- Use row-level quick actions from a bot, personal chat, and group/channel row.
- Use a bulk dialog quick action and confirm the Actions page receives the expected target set and action preset.

## Queue builder

- Select one account on the Actions page and confirm selection survives preview/run/refresh.
- Add one action with manual targets.
- Add one action from a dialog quick-action preset.
- Preview the queue and verify operation count, warnings, and estimated duration.
- Save the queue as a preset, refresh, reload it, and delete it.

## Queue run

- Run a small queue against a safe test target.
- Confirm live progress updates while running.
- Confirm per-run results show success/failure details.
- Confirm the run appears under Recent Queue Runs after completion.
- Start a multi-operation queue, request cancellation, and confirm it stops before the next operation.
- Run a queue across several accounts where one account does not have the target dialog and confirm the run continues while that account records a failed per-account result.
- Export or inspect run history and confirm it does not expose anything you would not want saved locally.

## Cleanup

- Delete exported ZIPs you no longer need.
- Remove disposable test sessions.
- Revoke sessions from Telegram settings if a test export was copied outside this machine.
- Review `git status --ignored` before any commit or push.
