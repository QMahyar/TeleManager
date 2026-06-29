"""Process-wide :class:`~telemanager.store.Document` singletons — one per file.

Each persisted document gets **exactly one** instance, and therefore exactly one
serialization gate, so every writer of a given document goes through the same
lock. Building a fresh instance at each call site would defeat the mutual
exclusion, so services import these shared instances instead of constructing
their own. ``config_doc`` in particular is shared between the config endpoint
(writes) and the account manager (reads).
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
runs_doc = Document(ACTION_RUNS_FILE)
schedules_doc = Document(SCHEDULES_FILE)
safety_doc = Document(SAFETY_SETTINGS_FILE)
app_settings_doc = Document(APP_SETTINGS_FILE)
