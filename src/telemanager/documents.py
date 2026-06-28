"""Process-wide :class:`~telemanager.store.Document` singletons — one per file.

Each persisted document gets **exactly one** instance, and therefore exactly one
serialization gate, so every writer of a given document goes through the same
lock (JSON backend) or transaction (SQLite backend). Building a fresh instance at
each call site would defeat the mutual exclusion, so services import these shared
instances instead of constructing their own. ``config_doc`` in particular is
shared between the config endpoint (writes) and the account manager (reads).

Backend is chosen by ``TELEMANAGER_STORE`` (see :mod:`telemanager.config`):

- ``json`` (default) — a per-file JSON :class:`Document` (human-readable, the
  Phase 2 store).
- ``sqlite`` — a :class:`SqliteDocument` per row of one SQLite database, behind
  the identical read/write/mutate/update surface, with the legacy JSON files
  migrated in once on first boot. This is the seam Phase 9 swaps; call sites are
  unchanged either way.

Paths/backend are resolved from :mod:`telemanager.config` at import time. The test
harness clears the whole ``telemanager`` package and re-imports it under a patched
data dir, so these singletons rebind to the temp location for each test.
"""
from __future__ import annotations

from .config import (
    ACCOUNTS_FILE,
    ACTION_PRESETS_FILE,
    ACTION_RUNS_FILE,
    APP_SETTINGS_FILE,
    CONFIG_FILE,
    SAFETY_SETTINGS_FILE,
    SCHEDULES_FILE,
    STORE_BACKEND,
    STORE_DB_FILE,
)
from .store import Document

# name -> legacy JSON file, shared by the SQLite migration and (as the path) the
# JSON Document constructor, so both backends agree on what each document is.
_DOCUMENTS = {
    "accounts": ACCOUNTS_FILE,
    "config": CONFIG_FILE,
    "action_presets": ACTION_PRESETS_FILE,
    "action_runs": ACTION_RUNS_FILE,
    "schedules": SCHEDULES_FILE,
    "safety_settings": SAFETY_SETTINGS_FILE,
    "app_settings": APP_SETTINGS_FILE,
}

if STORE_BACKEND == "sqlite":
    from .store_sqlite import SqliteDocument, SqliteStore

    _store = SqliteStore(STORE_DB_FILE)
    _store.migrate_from_json(_DOCUMENTS)

    accounts_doc = SqliteDocument(_store, "accounts")
    config_doc = SqliteDocument(_store, "config")
    presets_doc = SqliteDocument(_store, "action_presets")
    runs_doc = SqliteDocument(_store, "action_runs")
    schedules_doc = SqliteDocument(_store, "schedules")
    safety_doc = SqliteDocument(_store, "safety_settings")
    app_settings_doc = SqliteDocument(_store, "app_settings")
else:
    accounts_doc = Document(ACCOUNTS_FILE)
    config_doc = Document(CONFIG_FILE)
    presets_doc = Document(ACTION_PRESETS_FILE)
    runs_doc = Document(ACTION_RUNS_FILE)
    schedules_doc = Document(SCHEDULES_FILE)
    safety_doc = Document(SAFETY_SETTINGS_FILE)
    app_settings_doc = Document(APP_SETTINGS_FILE)
