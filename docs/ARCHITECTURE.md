# Architecture

TeleManager is a local FastAPI application with a static browser UI.

## Runtime components

```text
Browser UI
  -> FastAPI routes in src/telemanager/main.py
    -> AccountManager in src/telemanager/accounts.py
      -> Telethon TelegramClient
        -> local .session files in sessions/
```

## Backend

- `src/telemanager/main.py` exposes HTTP endpoints for configuration, login, challenge confirmation, and account lifecycle actions.
- `src/telemanager/accounts.py` owns account state, Telethon clients, pending login challenges, and session start/stop behavior.
- `src/telemanager/config.py` stores local JSON files under `data/` and keeps session files under `sessions/`.

## Frontend

- `src/telemanager/static/index.html` contains the dashboard shell and form/control IDs used by JavaScript.
- `src/telemanager/static/styles.css` contains the command-center visual system.
- `src/telemanager/static/app.js` calls the backend endpoints, renders accounts safely with DOM APIs, updates metrics, and maintains the local UI activity log.

## Data model

`data/accounts.json` stores account metadata such as label, phone, session name, status, and last error. It does not store Telegram login codes or 2FA passwords.

`data/config.json` stores the Telegram API ID and API hash locally.

## Session lifecycle

1. User saves Telegram API credentials.
2. User starts login with a phone number.
3. Telegram sends a code.
4. User confirms the code and optional 2FA password.
5. Telethon writes the `.session` file.
6. The app disconnects the client and leaves the account `stopped`.
7. Start reconnects using the saved `.session`; stop disconnects it.
