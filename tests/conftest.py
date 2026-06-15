# pyright: reportMissingImports=false
from __future__ import annotations

import importlib
import sys
from collections.abc import Iterator
from dataclasses import asdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def app_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[dict]:
    data_dir = tmp_path / "data"
    sessions_dir = tmp_path / "sessions"
    monkeypatch.setenv("TELEMANAGER_DATA_DIR", str(data_dir))
    monkeypatch.setenv("TELEMANAGER_SESSIONS_DIR", str(sessions_dir))

    modules = [name for name in sys.modules if name == "telemanager" or name.startswith("telemanager.")]
    for name in modules:
        sys.modules.pop(name, None)

    config = importlib.import_module("telemanager.config")
    accounts = importlib.import_module("telemanager.accounts")
    main = importlib.import_module("telemanager.main")

    client = TestClient(main.app)
    yield {
        "accounts": accounts,
        "client": client,
        "config": config,
        "data_dir": data_dir,
        "main": main,
        "sessions_dir": sessions_dir,
    }

    modules = [name for name in sys.modules if name == "telemanager" or name.startswith("telemanager.")]
    for name in modules:
        sys.modules.pop(name, None)


@pytest.fixture()
def client(app_context: dict) -> TestClient:
    return app_context["client"]


def add_account(app_context: dict, account_id: str = "acc-1", label: str = "Primary", authorized: bool = True):
    account = app_context["accounts"].AccountRecord(
        id=account_id,
        label=label,
        phone="",
        session_name=account_id,
        authorized=authorized,
        status="stopped",
    )
    app_context["main"].manager.accounts[account.id] = account
    app_context["main"].manager._save_accounts()
    return account


def account_dict(account) -> dict:
    return asdict(account)
