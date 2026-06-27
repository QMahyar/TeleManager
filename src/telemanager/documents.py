"""Process-wide :class:`~telemanager.store.Document` singletons — one per file.

Each persisted JSON file gets **exactly one** Document, and therefore exactly one
lock, so every writer of a given file serializes through the same gate. Building a
fresh ``Document(path)`` at each call site would give each its own lock and defeat
the mutual exclusion entirely, so services import these shared instances instead of
constructing their own. ``config_doc`` in particular is shared between the config
endpoint (writes) and the account manager (reads).

Paths are resolved from :mod:`telemanager.config` at import time. The test harness
clears the whole ``telemanager`` package and re-imports it under a patched data dir,
so these singletons rebind to the temp location for each test.

This is the single seam Phase 9 swaps: a SQLite-backed store exposing the same
read/write/mutate/update surface can replace ``Document`` here with no call-site change.
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
)
from .store import Document

accounts_doc = Document(ACCOUNTS_FILE)
config_doc = Document(CONFIG_FILE)
presets_doc = Document(ACTION_PRESETS_FILE)
schedules_doc = Document(SCHEDULES_FILE)
app_settings_doc = Document(APP_SETTINGS_FILE)
safety_doc = Document(SAFETY_SETTINGS_FILE)
runs_doc = Document(ACTION_RUNS_FILE)
