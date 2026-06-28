<!-- markdownlint-disable MD013 -->

<div align="center">

# TeleManager

**Local-first Telegram session manager for owned accounts**

[![Latest release](https://img.shields.io/github/v/release/QMahyar/TeleManager?label=latest\&color=0d9488)](https://github.com/QMahyar/TeleManager/releases/latest)
[![License](https://img.shields.io/github/license/QMahyar/TeleManager?color=0d9488)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-0d9488)](https://python.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Termux-555)](https://github.com/QMahyar/TeleManager/releases/latest)

</div>

---

TeleManager is a local web app that runs on your own machine. It manages all your owned Telegram accounts in one console: sessions, dialog discovery, guarded action queues, and recurring schedules — with every operation logged locally and nothing sent anywhere.

**No cloud. No subscriptions. No external services.**

---

## What you get

### Session management

Keep every Telegram account on your machine, in one place.

| Capability | Details |
|---|---|
| Log in | Phone code + optional 2FA |
| Import | Upload an existing `.session` file |
| Export | Secured ZIP backup with redacted metadata |
| Maintain | Rename, validate, log out, or delete any session |

### Dialog discovery

Fetch, search, and act on chats from any of your accounts.

- Finds personal chats, groups, supergroups, channels, and bots
- Caches dialog metadata locally so browsing is instant after the first fetch
- Profile photo thumbnails cached under `data/avatars/` (optional, off by default)
- Select any set of dialogs and push them directly into the action builder
- One-tap quick actions on individual dialogs (mute, archive, leave, mark read, and more)

### Guarded action queues

Build a queue of Telegram operations, review everything before it runs, then confirm.

| Category | Actions |
|---|---|
| Messaging | Send message · Forward message · Start bot |
| Membership | Join group or channel · Leave group or channel |
| Maintenance | Mute/unmute · Archive/unarchive · Mark as read · Delete dialog · Clear history |
| Moderation | Block user · Unblock user · Report spam |

Queues can span multiple accounts and multiple targets. You see the full operation list, estimated duration, and any warnings before a single request is sent.

### Recurring schedules

Turn any queue into a repeating schedule. TeleManager picks the delivery engine automatically:

- **Offline delivery** — plain text sends and `/start` commands are pre-loaded as Telegram-native scheduled messages. They fire even when TeleManager is closed, up to Telegram's 100-per-chat / 365-day limit.
- **In-app runner** — every other action type runs as a normal queue on each fire, while the app is open.

Schedules can be paused, resumed, run immediately, or deleted. A **Scheduled inspector** shows exactly what Telegram has pre-scheduled per chat and lets you clear individual items.

### Audit trail

Every queue operation is written to a local JSONL file. Browse, filter, and export the full activity history from the Activity screen.

---

## Download

[**→ Download the latest release**](https://github.com/QMahyar/TeleManager/releases/latest)

| Platform | File | How to run |
|---|---|---|
| Windows | `telemanager-windows-local.zip` | Extract → run `telemanager.exe` |
| Linux / macOS | `telemanager-linux-local.tar.gz` | Extract → run `./telemanager` |
| Android (Termux) | `telemanager-termux-arm64.tar.gz` | See [Termux setup](#termux-setup) below |

The app starts a local server and opens at **`http://127.0.0.1:8000`** in your browser.

> **You need a Telegram API ID and API hash.** Get them free at [my.telegram.org](https://my.telegram.org) — one pair works for all your accounts. Enter them on the Settings page after first launch.

---

## Quick start

**1. Download and extract** the package for your platform from the [Releases page](https://github.com/QMahyar/TeleManager/releases/latest).

**2. Run the app.**
- Windows: double-click `telemanager.exe`
- Linux / macOS: `./telemanager` in a terminal

**3. Open** `http://127.0.0.1:8000` in your browser.

**4. Go to Settings.** Save your Telegram API ID and API hash.

**5. Go to Accounts.** Log in your first account with its phone number.

Done. Dialogs, Actions, and Schedules are ready to use.

### Termux setup

```bash
tar -xzf telemanager-termux-arm64.tar.gz
./install-termux-alias.sh
telemanager
```

---

## Safety

TeleManager is designed to stay well within Telegram's limits.

**Built-in guardrails:**

- Every queue requires **explicit confirmation** before anything is sent to Telegram.
- **Action-aware pacing** — delays scale with how aggressively Telegram rate-limits each operation. Maintenance reads run fast; sends and forwards stay conservatively spaced with jitter.
- A **max operations cap** prevents accidentally building a queue larger than intended.
- **Per-account fault isolation** — a missing target or unavailable session fails that slot without aborting the rest of the queue.
- Queue **cancellation is cooperative**: a cancel request stops the worker before the next operation. Nothing is interrupted mid-flight.

**This tool is for your own accounts and targets you clearly own or are expected to act on** — for example, posting to a channel you run, or starting your own bot. It is not for:

- Spam or unsolicited messages
- Scams or impersonation
- Ban or limit evasion
- Mass outreach to people who did not ask for contact

Telegram enforces its own flood limits regardless of what TeleManager sets.

---

## Your data

Everything stays on your machine. No account data, session files, or activity logs ever leave your device.

| File | What it contains |
|---|---|
| `data/config.json` | Telegram API ID and API hash |
| `data/accounts.json` | Account labels and metadata |
| `sessions/*.session` | Telethon session files |
| `data/dialogs/` | Cached dialog metadata per account |
| `data/schedules.json` | Recurring schedule state |
| `data/action_runs.json` | Queue run history |
| `data/activity/events.jsonl` | Full audit log |

**`.session` files are sensitive authentication material.** They can give access to a Telegram account until Telegram invalidates the session. Never share them, store them in cloud-synced folders, or commit them to a repository. TeleManager keeps them in a local `sessions/` directory that is gitignored, and includes a security README in every ZIP export.

---

## What TeleManager is not

- **Not a hosted service.** It runs entirely on your machine and binds only to `127.0.0.1`.
- **Not a bot platform.** It acts as a Telegram *user account*, not a bot.
- **Not a mass-outreach tool.** Queues are conservative by design and capped by default.
- **Not remotely accessible.** There is no built-in authentication for remote exposure — keep it on localhost.

---

## License

[Apache License 2.0](LICENSE) © 2026 Mahyar

---

<div align="center">

[Developer guide](docs/DEVELOPMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Changelog](CHANGELOG.md) · [Security notes](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md)

</div>
