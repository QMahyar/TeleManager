from __future__ import annotations

import pytest


def test_activity_log_is_capped(app_context: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    audit = __import__("telemanager.audit_service", fromlist=["audit_service"])
    monkeypatch.setattr(audit, "MAX_EVENTS", 10)
    monkeypatch.setattr(audit, "_TRIM_CHECK_EVERY", 5)

    for index in range(40):
        audit.log_event("test_event", f"event {index}")

    events = audit.list_events(limit=10000)
    assert len(events) <= 10
    # Most recent events are kept; oldest are trimmed away.
    assert events[0]["title"] == "event 39"
    assert all(event["title"] != "event 0" for event in events)
