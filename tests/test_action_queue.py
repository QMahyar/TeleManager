from __future__ import annotations

from conftest import add_account
from pydantic import ValidationError


def test_queue_preview_expands_many_actions_accounts_and_targets(app_context: dict, client):
    add_account(app_context, "acc-1", "Primary")
    add_account(app_context, "acc-2", "Secondary")

    response = client.post(
        "/api/actions/queue/preview",
        json={
            "steps": [
                {
                    "action_type": "send_message",
                    "account_ids": ["acc-1", "acc-2"],
                    "targets": ["@chat_a", "@chat_b"],
                    "message": "hello",
                },
                {
                    "action_type": "leave_chat",
                    "account_ids": ["acc-1"],
                    "targets": ["@old_group"],
                },
            ],
            "delay_between_accounts": 4,
            "delay_between_actions": 8,
            "max_operations": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["step_count"] == 2
    assert payload["operation_count"] == 5
    assert payload["operations"][0]["account_label"] == "Primary"
    assert payload["warnings"]


def test_queue_preview_rejects_stale_account(client):
    response = client.post(
        "/api/actions/queue/preview",
        json={
            "steps": [{"action_type": "leave_chat", "account_ids": ["missing"], "targets": ["@group"]}],
            "max_operations": 10,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Account was not found."


def test_queue_request_trims_targets_and_requires_message(app_context: dict):
    main = app_context["main"]
    request = main.ActionQueueRequest(
        steps=[{"action_type": "leave_chat", "account_ids": ["acc-1"], "targets": [" @group ", ""]}]
    )
    assert request.steps[0].targets == ["@group"]

    try:
        main.ActionQueueRequest(
            steps=[{"action_type": "send_message", "account_ids": ["acc-1"], "targets": ["@chat"], "message": ""}]
        )
    except ValidationError as exc:
        assert "Message text is required" in str(exc)
    else:
        raise AssertionError("Expected send_message validation to fail")


def test_queue_request_rejects_operation_count_above_limit(app_context: dict):
    main = app_context["main"]
    try:
        main.ActionQueueRequest(
            steps=[{"action_type": "leave_chat", "account_ids": ["a", "b"], "targets": ["one", "two", "three"]}],
            max_operations=5,
        )
    except ValidationError as exc:
        assert "above the configured limit" in str(exc)
    else:
        raise AssertionError("Expected max operation validation to fail")
