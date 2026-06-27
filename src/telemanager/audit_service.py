from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from .config import DATA_DIR, atomic_write_text, ensure_dirs, now_iso

ACTIVITY_DIR = DATA_DIR / "activity"
EVENTS_FILE = ACTIVITY_DIR / "events.jsonl"
# Keep the local audit trail bounded so it cannot grow without limit.
MAX_EVENTS = 5000
_TRIM_CHECK_EVERY = 250
_appends_since_check = 0


def ensure_activity_dir() -> None:
    ensure_dirs()
    ACTIVITY_DIR.mkdir(parents=True, exist_ok=True)


def log_event(event_type: str, title: str, detail: str = "", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    ensure_activity_dir()
    event = {
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "event_type": event_type,
        "title": title,
        "detail": detail,
        "payload": payload or {},
    }
    with EVENTS_FILE.open("a", encoding="utf-8") as output:
        output.write(json.dumps(event, sort_keys=True) + "\n")
    _maybe_trim_events()
    return event


def _maybe_trim_events() -> None:
    """Periodically cap the JSONL to the most recent MAX_EVENTS lines.

    Events are low-frequency, so an occasional rewrite (every _TRIM_CHECK_EVERY
    appends) keeps the file bounded without re-reading it on every write.
    """
    global _appends_since_check
    _appends_since_check += 1
    if _appends_since_check < _TRIM_CHECK_EVERY:
        return
    _appends_since_check = 0
    if not EVENTS_FILE.exists():
        return
    lines = EVENTS_FILE.read_text(encoding="utf-8").splitlines()
    if len(lines) <= MAX_EVENTS:
        return
    # Atomic rewrite: the trim replaces the whole file, so a crash mid-write must
    # not truncate the audit trail (the security-of-record log).
    atomic_write_text(EVENTS_FILE, "\n".join(lines[-MAX_EVENTS:]) + "\n")


def list_events(limit: int = 200) -> list[dict[str, Any]]:
    ensure_activity_dir()
    if not EVENTS_FILE.exists():
        return []
    lines = EVENTS_FILE.read_text(encoding="utf-8").splitlines()
    events = []
    for line in lines[-limit:]:
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(events))


def export_events_path() -> Path:
    ensure_activity_dir()
    if not EVENTS_FILE.exists():
        EVENTS_FILE.write_text("", encoding="utf-8")
    return EVENTS_FILE
