# pyright: reportMissingImports=false
"""Phase 2: services persist through shared Document singletons.

These exercise the wiring (not the Document class itself — that's test_store.py):
that the migrated read-modify-write call-sites actually hold the per-file lock
across the cycle, so concurrent writers don't lose each other's update.
"""
from __future__ import annotations

import importlib
import threading


def test_concurrent_preset_saves_do_not_lose_updates(app_context: dict) -> None:
    presets = importlib.import_module("telemanager.presets_service")
    count = 16

    def worker(index: int) -> None:
        presets.save_action_preset(f"Preset {index:02d}", {"steps": []})

    workers = [threading.Thread(target=worker, args=(i,)) for i in range(count)]
    for t in workers:
        t.start()
    for t in workers:
        t.join()

    # Old code (list -> modify -> write_json) would interleave and drop presets;
    # save_action_preset now upserts inside presets_doc.mutate(), so all survive.
    names = {preset["name"] for preset in presets.list_action_presets()}
    assert names == {f"Preset {i:02d}" for i in range(count)}


def test_delete_missing_preset_raises_and_writes_nothing(app_context: dict) -> None:
    presets = importlib.import_module("telemanager.presets_service")
    presets.save_action_preset("Keeper", {"steps": []})

    import pytest

    with pytest.raises(ValueError, match="not found"):
        presets.delete_action_preset("does-not-exist")

    # Raising inside mutate() must not clobber the existing preset.
    assert [preset["name"] for preset in presets.list_action_presets()] == ["Keeper"]


def test_set_config_merges_without_dropping_existing_hash(app_context: dict) -> None:
    client = app_context["client"]
    assert client.post("/api/config", json={"api_id": 111, "api_hash": "deadbeef"}).status_code == 200

    # A later POST that omits api_hash must merge over the stored value, not wipe it
    # (set_config reads + writes inside config_doc.mutate()).
    resp = client.post("/api/config", json={"api_id": 222})
    assert resp.status_code == 200
    assert resp.json()["api_hash_configured"] is True

    config = client.get("/api/config").json()
    assert config["api_id"] == 222
    assert config["api_hash_configured"] is True
