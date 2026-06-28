"""SQLite-backed implementation of the :class:`~telemanager.store.Document`
read/write/mutate/update contract.

Each logical document (config, accounts, presets, …) is a single row in a
``documents(name, data)`` table holding its JSON blob, so the storage-agnostic
call sites in the services keep working unchanged — :mod:`telemanager.documents`
just hands out :class:`SqliteDocument` instances instead of JSON ``Document``\\s.

Threading model: one connection (``check_same_thread=False``) guarded by a
``threading.Lock``, because SQLite connections aren't safe for concurrent
cross-thread use and persistence is touched from both the anyio threadpool and
the event loop. The lock serializes access to the connection; what the JSON store
*couldn't* do — and this can — is wrap each read-modify-write in a real
transaction, so a mutate that raises half-way rolls back and leaves nothing
partial (the JSON store merely skipped the final write). Per-connection-pool
designs that lean on ``BEGIN IMMEDIATE`` + ``busy_timeout`` to serialize writers
were finicky in practice and buy nothing at single-user, localhost scale.
"""
from __future__ import annotations

import copy
import json
import sqlite3
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, TypeVar

from .config import read_json

T = TypeVar("T")


class SqliteStore:
    """A single SQLite database backing many named documents."""

    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        # isolation_level=None → autocommit; we manage BEGIN/COMMIT ourselves so
        # each read-modify-write is one explicit, rollback-able transaction.
        self._conn = sqlite3.connect(
            db_path, check_same_thread=False, isolation_level=None
        )
        # WAL + NORMAL sync: commits don't fsync the whole DB on every write
        # (safe — a crash can lose at most the last transaction, never corrupt
        # the file), which matters because each guarded action persists a run.
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS documents "
            "(name TEXT PRIMARY KEY, data TEXT NOT NULL)"
        )

    def read(self, name: str, default: T) -> T:
        """Current value of a document, or a deep copy of ``default`` if unset."""
        with self._lock:
            return _get(self._conn, name, default)

    def write(self, name: str, value: Any) -> None:
        """Overwrite a whole document (a single statement, atomically committed)."""
        with self._lock:
            _put(self._conn, name, value)

    @contextmanager
    def mutate(self, name: str, default: T) -> Iterator[T]:
        """Hold the lock + a transaction across read -> mutate -> write so
        concurrent writers can't lose each other's update. Yields the value to
        edit in place; committed on clean exit, rolled back (nothing persisted)
        on exception."""
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                value = _get(self._conn, name, default)
                yield value
                _put(self._conn, name, value)
                self._conn.execute("COMMIT")
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise

    def update(self, name: str, fn: Callable[[T], T], default: T) -> T:
        """Functional variant of :meth:`mutate` for replace-style edits."""
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                new_value = fn(_get(self._conn, name, default))
                _put(self._conn, name, new_value)
                self._conn.execute("COMMIT")
                return new_value
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise

    def migrate_from_json(self, mapping: dict[str, Path]) -> None:
        """One-time import of the legacy JSON files. For each ``name -> path``,
        if the row is absent and the file exists, copy its parsed contents in.
        Idempotent: an existing row is never overwritten, so this is safe to run
        on every boot and a no-op once migrated (or on a fresh install)."""
        with self._lock:
            for name, path in mapping.items():
                present = self._conn.execute(
                    "SELECT 1 FROM documents WHERE name = ?", (name,)
                ).fetchone()
                if present:
                    continue
                data = read_json(path, None)
                if data is not None:
                    _put(self._conn, name, data)


def _get(conn: sqlite3.Connection, name: str, default: T) -> T:
    row = conn.execute(
        "SELECT data FROM documents WHERE name = ?", (name,)
    ).fetchone()
    return json.loads(row[0]) if row else copy.deepcopy(default)


def _put(conn: sqlite3.Connection, name: str, value: Any) -> None:
    conn.execute(
        "INSERT INTO documents (name, data) VALUES (?, ?) "
        "ON CONFLICT(name) DO UPDATE SET data = excluded.data",
        (name, json.dumps(value)),
    )


class SqliteDocument:
    """Adapter exposing one row of a :class:`SqliteStore` through the same
    surface as the JSON ``Document`` (read/write/mutate/update)."""

    def __init__(self, store: SqliteStore, name: str) -> None:
        self._store = store
        self._name = name

    def read(self, default: T) -> T:
        return self._store.read(self._name, default)

    def write(self, value: Any) -> None:
        self._store.write(self._name, value)

    def mutate(self, default: T) -> Any:
        return self._store.mutate(self._name, default)

    def update(self, fn: Callable[[T], T], default: T) -> T:
        return self._store.update(self._name, fn, default)
