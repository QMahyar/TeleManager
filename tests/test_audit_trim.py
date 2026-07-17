# pyright: reportMissingImports=false
"""Audit-log trim keeps the JSONL bounded and well-formed.

The trim does a whole-file rewrite via atomic_write_text (temp + replace), so a
reader never sees a torn line and the log can't grow unbounded.
"""

from __future__ import annotations

import importlib
import json
from concurrent.futures import ThreadPoolExecutor


def test_audit_trim_bounds_file_and_keeps_every_line_valid(app_context: dict, monkeypatch) -> None:
    audit = importlib.import_module("telemanager.audit_service")
    # Shrink the thresholds so a trim fires quickly and deterministically. Logging a
    # multiple of _TRIM_CHECK_EVERY that exceeds MAX_EVENTS lands a trim on the last
    # append, leaving exactly MAX_EVENTS lines.
    monkeypatch.setattr(audit, "MAX_EVENTS", 10)
    monkeypatch.setattr(audit, "_TRIM_CHECK_EVERY", 5)
    monkeypatch.setattr(audit, "_appends_since_check", 0)

    for i in range(1, 31):
        audit.log_event("test_event", "Test", f"event-{i:02d}")

    lines = audit.EVENTS_FILE.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 10  # capped to MAX_EVENTS at the final check boundary
    # Every retained line is a complete JSON object — the atomic rewrite never leaves
    # a half-written/truncated line behind.
    assert all(isinstance(json.loads(line), dict) for line in lines)

    details = [event["detail"] for event in audit.list_events(limit=50)]
    assert details[0] == "event-30"  # newest retained, newest-first
    assert "event-21" in details  # oldest retained
    assert "event-20" not in details  # trimmed away


def test_concurrent_logging_and_trim_are_serialized(app_context: dict, monkeypatch) -> None:
    audit = importlib.import_module("telemanager.audit_service")
    monkeypatch.setattr(audit, "MAX_EVENTS", 200)
    monkeypatch.setattr(audit, "_TRIM_CHECK_EVERY", 2)
    monkeypatch.setattr(audit, "_appends_since_check", 0)

    def write_events(worker: int) -> None:
        for index in range(100):
            audit.log_event("test_event", "Concurrent", f"{worker}-{index}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(write_events, worker) for worker in range(8)]
        for future in futures:
            future.result(timeout=20)

    lines = audit.EVENTS_FILE.read_text(encoding="utf-8").splitlines()
    events = [json.loads(line) for line in lines]
    assert len(events) <= audit.MAX_EVENTS + audit._TRIM_CHECK_EVERY - 1
    assert len({event["id"] for event in events}) == len(events)
