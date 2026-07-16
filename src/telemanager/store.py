from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, TypeVar

from .config import read_json, write_json

T = TypeVar("T")


class Document:
    """A single JSON file with a process-wide lock guarding read-modify-write.

    ``write_json`` already makes each write atomic (temp file + replace), so a
    reader never sees a torn or truncated file and a crash leaves the prior
    version intact. This class adds a lock so the read -> modify -> write *cycle*
    is serialized: two callers mutating the same file can't silently lose each
    other's update (last-write-wins).

    Why ``threading.Lock`` and not ``asyncio.Lock``: persistence is touched from
    both FastAPI's sync route handlers (anyio threadpool) and the scheduler/queue
    tasks (event loop). Only a thread lock serializes both. It is held only for
    the duration of a small JSON read+write, and the codebase already performs
    synchronous file IO on the loop, so briefly blocking it here is consistent.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        return self._path

    def read(self, default: T) -> T:
        """Return the current value. Reads are atomic at the file level (writes
        are temp+replace), so a plain read needs no lock."""
        return read_json(self._path, default)

    def write(self, value: Any) -> None:
        """Overwrite the whole document under the lock."""
        with self._lock:
            write_json(self._path, value)

    def write_compact(self, value: Any) -> None:
        """Overwrite the whole document under the lock with minimal JSON (no indent).

        Saves disk I/O and file size for large, frequently-updated documents like
        the action-run history.
        """
        with self._lock:
            write_json(self._path, value, indent=None)

    @contextmanager
    def mutate(self, default: T) -> Iterator[T]:
        """Hold the lock across read -> mutate -> write so updates can't be lost.

        Yields the current value for the caller to mutate **in place** (e.g.
        ``d[key] = ...``, ``d.pop(key)``, ``d[:] = [...]``); the result is written
        back on clean exit. On exception nothing is written.
        """
        with self._lock:
            value = read_json(self._path, default)
            yield value
            write_json(self._path, value)
