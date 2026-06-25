from __future__ import annotations

import typing

from conftest import add_account


def _telegram_actions(app_context: dict):
    return __import__("telemanager.telegram_actions", fromlist=["telegram_actions"])


def _queue_service(app_context: dict):
    return __import__("telemanager.action_queue_service", fromlist=["action_queue_service"])


def _schedules(app_context: dict):
    return __import__("telemanager.schedules_service", fromlist=["schedules_service"])


# ---------------------------------------------------------------------------
# Registry is the single source of truth
# ---------------------------------------------------------------------------


def test_action_meta_covers_every_action_type(app_context: dict):
    ta = _telegram_actions(app_context)
    declared = set(typing.get_args(ta.TelegramActionType))
    assert set(ta.ACTION_META) == declared, "every action type must have an ACTION_META entry"


def test_valid_targets_is_derived_from_action_meta(app_context: dict):
    ta = _telegram_actions(app_context)
    assert ta.VALID_TARGETS == {action: meta.valid_targets for action, meta in ta.ACTION_META.items()}


def test_message_required_actions_match_known_set(app_context: dict):
    ta = _telegram_actions(app_context)
    assert ta.MESSAGE_REQUIRED_ACTIONS == frozenset(
        {
            "send_message",
            "send_media",
            "schedule_message",
            "forward_message",
            "edit_message",
            "delete_messages",
            "pin_message",
            "unpin_message",
            "download_media",
        }
    )


def test_tier_assignments_follow_telegram_risk(app_context: dict):
    ta = _telegram_actions(app_context)
    tier = {action: meta.tier for action, meta in ta.ACTION_META.items()}
    # Benign / read-only / local actions are instant.
    for action in ("read_chat", "mute_chat", "unmute_chat", "archive_chat", "unarchive_chat", "delete_chat"):
        assert tier[action] == "instant", action
    # Content-creating / spam-prone / daily-capped actions are sensitive.
    for action in ("send_message", "send_media", "forward_message", "schedule_message", "start_bot", "join_chat"):
        assert tier[action] == "sensitive", action
    # Moderate account-visible writes are standard.
    for action in ("leave_chat", "block_user", "edit_message", "pin_message", "report_spam"):
        assert tier[action] == "standard", action


# ---------------------------------------------------------------------------
# Tier-aware delay resolver
# ---------------------------------------------------------------------------

_DELAYS = {"accounts": 4.0, "instant": 1.0, "standard": 8.0, "sensitive": 12.0}


def test_same_account_uses_action_tier_delay(app_context: dict):
    qs = _queue_service(app_context)
    assert qs.inter_operation_delay("a", "a", "read_chat", _DELAYS) == 1.0
    assert qs.inter_operation_delay("a", "a", "leave_chat", _DELAYS) == 8.0


def test_account_switch_takes_max_of_account_and_tier_delay(app_context: dict):
    qs = _queue_service(app_context)
    # instant tier (1s) is below the account delay (4s) -> account delay wins.
    assert qs.inter_operation_delay("a", "b", "read_chat", _DELAYS) == 4.0
    # sensitive tier always gets at least its base spacing even across an account switch.
    assert qs.inter_operation_delay("a", "b", "send_message", _DELAYS) >= 12.0


def test_sensitive_tier_adds_bounded_jitter(app_context: dict):
    qs = _queue_service(app_context)
    samples = [qs.inter_operation_delay("a", "a", "send_message", _DELAYS) for _ in range(200)]
    assert min(samples) >= 12.0
    assert max(samples) <= 12.0 * (1.0 + qs.SENSITIVE_JITTER_FRACTION)
    assert len(set(samples)) > 1, "jitter should vary across calls"


def test_unknown_action_falls_back_to_standard(app_context: dict):
    ta = _telegram_actions(app_context)
    assert ta.action_tier("not_a_real_action") == "standard"


# ---------------------------------------------------------------------------
# Safety settings: tier fields, back-compat, persistence
# ---------------------------------------------------------------------------


def test_safety_defaults_backfill_tier_fields_from_legacy_file(app_context: dict):
    config = app_context["config"]
    qs = _queue_service(app_context)
    # A settings file written before tiered timing only had these three keys.
    config.write_json(
        config.SAFETY_SETTINGS_FILE,
        {"delay_between_accounts": 5, "delay_between_actions": 9, "max_operations": 50},
    )
    defaults = qs.safety_defaults()
    assert defaults["delay_between_accounts"] == 5
    assert defaults["delay_between_actions"] == 9  # standard tier keeps the historical value
    assert defaults["delay_instant"] == 1.0  # new fields default cleanly
    assert defaults["delay_sensitive"] == 12.0
    assert defaults["max_operations"] == 50


def test_resolved_queue_delays_prefers_request_overrides(app_context: dict):
    qs = _queue_service(app_context)
    add_account(app_context, "acc-1", "Primary")
    request = qs.ActionQueueRequest(
        steps=[{"action_type": "read_chat", "account_ids": ["acc-1"], "targets": ["@chat"]}],
        delay_instant=0.0,
        delay_sensitive=20.0,
    )
    delays = qs.resolved_queue_delays(request)
    assert delays["instant"] == 0.0  # explicit 0 honoured (not treated as "unset")
    assert delays["sensitive"] == 20.0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def test_actions_meta_endpoint_shape(client):
    response = client.get("/api/actions/meta")
    assert response.status_code == 200
    body = response.json()
    assert set(body["tier_delays"]) == {"instant", "standard", "sensitive"}
    assert body["actions"]["read_chat"]["tier"] == "instant"
    assert body["actions"]["send_message"]["tier"] == "sensitive"
    assert body["actions"]["delete_messages"]["destructive"] is True


def test_safety_settings_round_trip_with_tiers(client):
    response = client.post(
        "/api/settings/safety",
        json={
            "delay_between_accounts": 4,
            "delay_between_actions": 8,
            "delay_instant": 0.5,
            "delay_sensitive": 15,
            "max_operations": 100,
        },
    )
    assert response.status_code == 200
    assert response.json()["settings"]["delay_instant"] == 0.5

    meta = client.get("/api/actions/meta").json()
    assert meta["tier_delays"]["sensitive"] == 15


# ---------------------------------------------------------------------------
# Scheduler native classification still derives correctly from the registry
# ---------------------------------------------------------------------------


def test_scheduler_native_classification_parity(app_context: dict):
    sch = _schedules(app_context)
    assert sch._step_is_native({"action_type": "send_message", "message": "hi"})
    assert sch._step_is_native({"action_type": "send_media", "message": "file=x.jpg"})
    assert sch._step_is_native({"action_type": "start_bot", "message": ""})  # plain /start
    assert not sch._step_is_native({"action_type": "start_bot", "message": "start=ref"})  # referral
    assert not sch._step_is_native({"action_type": "join_chat"})

    native_engine, _ = sch.classify_engine([{"action_type": "send_message", "message": "hi"}])
    assert native_engine == "native"
    runner_engine, _ = sch.classify_engine([{"action_type": "join_chat"}])
    assert runner_engine == "runner"
