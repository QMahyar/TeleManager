from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import DATA_DIR, ensure_dirs

ACTIVITY_DIR = DATA_DIR / "activity"
EVENTS_FILE = ACTIVITY_DIR / "events.jsonl"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


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
    return event


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


def get_event(event_id: str) -> dict[str, Any] | None:
    for event in list_events(limit=10000):
        if event.get("id") == event_id:
            return event
    return None


def export_events_path() -> Path:
    ensure_activity_dir()
    if not EVENTS_FILE.exists():
        EVENTS_FILE.write_text("", encoding="utf-8")
    return EVENTS_FILE
