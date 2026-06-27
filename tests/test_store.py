# pyright: reportMissingImports=false
"""The Document store: atomic writes + a lock that closes the read-modify-write
window so concurrent writers don't lose each other's update."""
from __future__ import annotations

import importlib
import threading
from pathlib import Path


def _store(app_context: dict):
    return importlib.import_module("telemanager.store")


def test_mutate_persists_in_place_edits(app_context: dict, tmp_path: Path) -> None:
    store = _store(app_context)
    doc = store.Document(tmp_path / "doc.json")
    with doc.mutate({}) as data:
        data["a"] = 1
    assert doc.read({}) == {"a": 1}


def test_mutate_does_not_write_on_exception(app_context: dict, tmp_path: Path) -> None:
    store = _store(app_context)
    doc = store.Document(tmp_path / "doc.json")
    doc.write({"keep": True})
    try:
        with doc.mutate({}) as data:
            data["broken"] = True
            raise RuntimeError("boom")
    except RuntimeError:
        pass
    assert doc.read({}) == {"keep": True}


def test_concurrent_mutate_does_not_lose_updates(app_context: dict, tmp_path: Path) -> None:
    store = _store(app_context)
    doc = store.Document(tmp_path / "counter.json")
    doc.write({"n": 0})
    threads = 20
    increments_per_thread = 25

    def worker() -> None:
        for _ in range(increments_per_thread):
            with doc.mutate({"n": 0}) as data:
                data["n"] += 1

    workers = [threading.Thread(target=worker) for _ in range(threads)]
    for t in workers:
        t.start()
    for t in workers:
        t.join()

    # Without the lock, interleaved read-modify-write would lose updates and the
    # final count would be < threads * increments_per_thread.
    assert doc.read({"n": 0})["n"] == threads * increments_per_thread
