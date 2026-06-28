# pyright: reportMissingImports=false
"""Phase 9: the SQLite store honours the same Document contract as the JSON
store, serializes concurrent writers with transactions (not a Python lock),
migrates the legacy JSON files exactly once, and backs the services unchanged
when selected via TELEMANAGER_STORE=sqlite."""
from __future__ import annotations

import importlib
import json
import sys
import threading
from pathlib import Path

import pytest

from telemanager.store_sqlite import SqliteDocument, SqliteStore


def _doc(tmp_path: Path, name: str = "doc") -> SqliteDocument:
    return SqliteDocument(SqliteStore(tmp_path / "store.db"), name)


def test_mutate_persists_in_place_edits(tmp_path: Path) -> None:
    doc = _doc(tmp_path)
    with doc.mutate({}) as data:
        data["a"] = 1
    assert doc.read({}) == {"a": 1}


def test_mutate_does_not_write_on_exception(tmp_path: Path) -> None:
    doc = _doc(tmp_path)
    doc.write({"keep": True})
    with pytest.raises(RuntimeError):
        with doc.mutate({}) as data:
            data["broken"] = True
            raise RuntimeError("boom")
    # The transaction rolled back, so the existing value is untouched.
    assert doc.read({}) == {"keep": True}


def test_read_returns_a_fresh_copy_of_the_default(tmp_path: Path) -> None:
    store = SqliteStore(tmp_path / "store.db")
    got = store.read("missing", {"d": 1})
    got["d"] = 99
    # Mutating the returned default must not poison the next read's default.
    assert store.read("missing", {"d": 1}) == {"d": 1}


def test_concurrent_mutate_does_not_lose_updates(tmp_path: Path) -> None:
    doc = _doc(tmp_path, "counter")
    doc.write({"n": 0})
    threads, per_thread = 20, 25

    def worker() -> None:
        for _ in range(per_thread):
            with doc.mutate({"n": 0}) as data:
                data["n"] += 1

    workers = [threading.Thread(target=worker) for _ in range(threads)]
    for t in workers:
        t.start()
    for t in workers:
        t.join()

    # BEGIN IMMEDIATE serializes the read-modify-write across connections, so no
    # increment is lost — the SQLite analogue of the JSON store's lock test.
    assert doc.read({"n": 0})["n"] == threads * per_thread


def test_migrate_from_json_imports_once(tmp_path: Path) -> None:
    legacy = tmp_path / "config.json"
    legacy.write_text(json.dumps({"api_id": 7}), encoding="utf-8")
    store = SqliteStore(tmp_path / "store.db")

    store.migrate_from_json({"config": legacy})
    assert store.read("config", {}) == {"api_id": 7}

    # Idempotent: re-running migration must not clobber a row that has since
    # diverged from the (stale) legacy file.
    store.write("config", {"api_id": 7, "api_hash": "x"})
    store.migrate_from_json({"config": legacy})
    assert store.read("config", {}) == {"api_id": 7, "api_hash": "x"}


def test_services_run_on_sqlite_backend(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TELEMANAGER_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TELEMANAGER_SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("TELEMANAGER_STORE", "sqlite")
    _clear_telemanager()

    presets = importlib.import_module("telemanager.presets_service")
    documents = importlib.import_module("telemanager.documents")
    assert type(documents.presets_doc).__name__ == "SqliteDocument"

    count = 16

    def worker(index: int) -> None:
        presets.save_action_preset(f"Preset {index:02d}", {"steps": []})

    workers = [threading.Thread(target=worker, args=(i,)) for i in range(count)]
    for t in workers:
        t.start()
    for t in workers:
        t.join()

    names = {preset["name"] for preset in presets.list_action_presets()}
    assert names == {f"Preset {i:02d}" for i in range(count)}

    _clear_telemanager()


def _clear_telemanager() -> None:
    for name in [
        n for n in sys.modules if n == "telemanager" or n.startswith("telemanager.")
    ]:
        sys.modules.pop(name, None)
