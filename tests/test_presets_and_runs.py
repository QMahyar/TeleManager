from __future__ import annotations

from pathlib import Path


def test_presets_save_list_replace_and_delete(app_context: dict):
    service = __import__("telemanager.presets_service", fromlist=["presets_service"])
    queue = {
        "steps": [{"action_type": "leave", "account_ids": ["acc-1"], "targets": ["@group"]}],
        "delay_between_accounts": 4,
        "delay_between_actions": 8,
        "max_operations": 100,
    }

    saved = service.save_action_preset("My Preset", queue)
    assert saved["id"] == "my-preset"
    assert service.list_action_presets()[0]["name"] == "My Preset"

    replaced = service.save_action_preset("My Preset", {**queue, "max_operations": 25})
    assert replaced["created_at"] == saved["created_at"]
    assert len(service.list_action_presets()) == 1
    assert service.list_action_presets()[0]["queue"]["max_operations"] == 25

    service.delete_action_preset("my-preset")
    assert service.list_action_presets() == []


def test_presets_reject_invalid_names(app_context: dict):
    service = __import__("telemanager.presets_service", fromlist=["presets_service"])
    try:
        service.save_action_preset("!!", {})
    except ValueError as exc:
        assert "Preset name" in str(exc)
    else:
        raise AssertionError("Expected invalid preset name to fail")


def test_run_history_sorts_trims_and_restores_interrupted(app_context: dict):
    config = app_context["config"]
    service = __import__("telemanager.action_runs_service", fromlist=["action_runs_service"])
    runs = {
        f"run-{index}": {
            "id": f"run-{index}",
            "status": "completed",
            "created_at": f"2026-01-01T00:00:{index:02d}+00:00",
            "updated_at": f"2026-01-01T00:00:{index:02d}+00:00",
        }
        for index in range(105)
    }

    service.save_action_runs(runs)
    saved = config.read_json(config.ACTION_RUNS_FILE, {})
    assert len(saved) == 100
    listed = service.list_action_runs(saved, limit=3)
    assert [item["id"] for item in listed] == ["run-99", "run-98", "run-97"]

    config.write_json(
        config.ACTION_RUNS_FILE,
        {
            "active": {
                "id": "active",
                "status": "running",
                "created_at": "2026-01-01T00:00:00+00:00",
                "current": {"target": "@chat"},
            },
            "canceled": {"id": "canceled", "status": "canceled", "created_at": "2026-01-01T00:00:01+00:00"},
        },
    )
    restored = service.load_action_runs()
    assert restored["active"]["status"] == "interrupted"
    assert restored["active"]["current"] is None
    assert restored["canceled"]["status"] == "canceled"
    assert Path(config.ACTION_RUNS_FILE).exists()
