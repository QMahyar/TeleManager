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


def test_audit_queue_request_strips_message_bodies(app_context: dict) -> None:
    import json

    from telemanager.action_queue_service import ActionQueueRequest, ActionQueueStep, _audit_queue_request

    req = ActionQueueRequest(
        steps=[
            ActionQueueStep(
                action_type="send_message",
                account_ids=["acc-1"],
                targets=["@x"],
                message="super secret outbound text",
            )
        ],
        confirm=True,
    )
    dumped = _audit_queue_request(req)
    step = dumped["steps"][0]
    assert "super secret outbound text" not in json.dumps(dumped)
    assert step.get("has_message") is True
    assert step.get("message") in (None, "", False) or "message" not in step
    # High-level shape is preserved for operators reading the activity trail.
    assert step["action_type"] == "send_message"
    assert step["targets"] == ["@x"]
    assert step["account_ids"] == ["acc-1"]
