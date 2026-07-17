from __future__ import annotations

import asyncio
import io
import zipfile
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from conftest import add_account


def test_fetch_dialogs_disconnects_client(app_context: dict, monkeypatch: pytest.MonkeyPatch):
    # Regression: dialogs_service must reach `_disconnect(client)` in its finally
    # block without a NameError (the helper lives in accounts and must be imported).
    account = add_account(app_context, "acc-1", "Primary")
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    manager = app_context["main"].manager

    disconnected = {"called": False}

    class FakeClient:
        async def iter_dialogs(self, limit=0):
            return
            yield  # unreachable yield makes this an async generator

        def disconnect(self):
            disconnected["called"] = True
            return None

    fake = FakeClient()
    monkeypatch.setattr(manager, "get_api_credentials", lambda: (1, "hash"))
    monkeypatch.setattr(manager, "_new_client", lambda *a, **k: fake)

    async def _connect(_client):
        return None

    async def _authorized(_client):
        return True

    monkeypatch.setattr(manager, "_connect_client", _connect)
    monkeypatch.setattr(manager, "_is_user_authorized", _authorized)

    payload = asyncio.run(dialogs_service.fetch_dialogs(manager, account.id, limit=10))
    assert payload["account_id"] == account.id
    assert disconnected["called"] is True


def test_cached_dialogs_default_and_existing_payload(app_context: dict):
    account = add_account(app_context, "acc-1", "Primary")
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    config = app_context["config"]

    empty = dialogs_service.list_cached_dialogs(app_context["main"].manager, account.id)
    assert empty["account_label"] == "Primary"
    assert empty["dialogs"] == []

    config.write_json(
        dialogs_service.dialogs_path(account.id),
        {"account_id": account.id, "account_label": account.label, "fetched_at": "now", "dialogs": [{"id": 1}]},
    )
    cached = dialogs_service.list_cached_dialogs(app_context["main"].manager, account.id)
    assert cached["dialogs"] == [{"id": 1}]


def test_list_cached_dialogs_marks_legacy_ids(app_context: dict):
    # Caches written before id-marking stored the bare entity.id for groups and
    # channels. Reading them now returns the canonical marked ids so a
    # username-less chat resolves the right peer without a re-fetch.
    account = add_account(app_context, "acc-1", "Primary")
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    config = app_context["config"]
    config.write_json(
        dialogs_service.dialogs_path(account.id),
        {
            "account_id": account.id,
            "account_label": account.label,
            "fetched_at": "now",
            "dialogs": [
                {"id": 1424486089, "dialog_type": "supergroup", "is_channel": True, "is_group": True},
                {"id": 555, "dialog_type": "group", "is_group": True, "is_channel": False},
                {"id": 777, "dialog_type": "personal"},
            ],
        },
    )

    cached = dialogs_service.list_cached_dialogs(app_context["main"].manager, account.id)
    assert [item["id"] for item in cached["dialogs"]] == [-1001424486089, -555, 777]


def test_cached_dialogs_unknown_account_fails(app_context: dict):
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    try:
        dialogs_service.list_cached_dialogs(app_context["main"].manager, "missing")
    except ValueError as exc:
        assert "Account was not found" in str(exc)
    else:
        raise AssertionError("Expected missing account to fail")


def test_search_result_carries_chat_label():
    # A global-search hit must label which chat it came from; chat_title falls back
    # to the chat id when the entity has no display name.
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    message = SimpleNamespace(
        id=42,
        date=datetime(2026, 6, 30, tzinfo=UTC),
        message="hello world",
        sender=None,
        sender_id=7,
        out=False,
        media=None,
        chat=SimpleNamespace(title="Ops Room", username="ops"),
        chat_id=-100123,
    )
    result = dialogs_service.search_result_to_dict(message)
    assert result["text"] == "hello world"
    assert result["chat_title"] == "Ops Room"
    assert result["chat_id"] == -100123
    assert result["chat_username"] == "ops"

    # No chat entity -> degrade to the bare id, never crash.
    bare = SimpleNamespace(
        id=1,
        date=None,
        message="",
        sender=None,
        sender_id=None,
        out=False,
        media=None,
        chat=None,
        chat_id=-100999,
    )
    assert dialogs_service.search_result_to_dict(bare)["chat_title"] == "-100999"


def test_classify_dialog_reads_muted_state():
    # muted is derived from notify_settings.mute_until being in the future.
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    User = __import__("telethon.tl.types", fromlist=["User"]).User

    def make_dialog(mute_until):
        entity = User(id=500, access_hash=0)
        return SimpleNamespace(
            entity=entity,
            name="Someone",
            unread_count=0,
            pinned=False,
            archived=False,
            dialog=SimpleNamespace(notify_settings=SimpleNamespace(mute_until=mute_until)),
        )

    future = datetime.now(UTC) + timedelta(days=365)
    past = datetime.now(UTC) - timedelta(days=1)
    assert dialogs_service.classify_dialog(make_dialog(future)).muted is True
    assert dialogs_service.classify_dialog(make_dialog(past)).muted is False
    assert dialogs_service.classify_dialog(make_dialog(None)).muted is False


def test_import_session_rejects_non_session_file(client):
    # The UI imports via the batch endpoint, which records per-file failures
    # rather than aborting the whole request.
    response = client.post(
        "/api/sessions/import-files",
        files=[("files", ("bad.txt", b"not a session", "text/plain"))],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["imported"] == []
    assert payload["failed"][0]["error"] == "Only .session files can be imported."


def test_import_session_batch_limit_rejects_before_service(client, monkeypatch) -> None:
    accounts_route = __import__("telemanager.routes.accounts", fromlist=["import_session_files"])
    called = False

    async def fake_import(*_args):
        nonlocal called
        called = True
        return {"imported": [], "failed": []}

    monkeypatch.setattr(accounts_route, "import_session_files", fake_import)
    files = [("files", (f"file-{index}.session", b"x", "application/octet-stream")) for index in range(26)]
    response = client.post("/api/sessions/import-files", files=files)
    assert response.status_code == 400
    assert called is False

    files = [("files", (f"file-{index}.session", b"x", "application/octet-stream")) for index in range(25)]
    response = client.post("/api/sessions/import-files", files=files)
    assert response.status_code == 200
    assert called is True


def test_import_session_size_boundaries_and_cleanup(app_context: dict, monkeypatch) -> None:
    service = __import__("telemanager.sessions_service", fromlist=["import_session_files"])
    monkeypatch.setattr(service, "MAX_SESSION_IMPORT_BYTES", 4)

    async def fake_validate(account_id):
        return app_context["main"].manager.accounts[account_id]

    monkeypatch.setattr(app_context["main"].manager, "validate_account", fake_validate)
    UploadFile = __import__("fastapi", fromlist=["UploadFile"]).UploadFile

    exact = UploadFile(filename="exact.session", file=io.BytesIO(b"1234"))
    oversized = UploadFile(filename="large.session", file=io.BytesIO(b"12345"))
    empty = UploadFile(filename="empty.session", file=io.BytesIO(b""))
    valid = UploadFile(filename="valid.session", file=io.BytesIO(b"ok"))
    result = asyncio.run(service.import_session_files(app_context["main"].manager, [exact, oversized, empty, valid]))

    assert len(result["imported"]) == 2
    assert len(result["failed"]) == 2
    assert any("exceeds" in item["error"] for item in result["failed"])
    assert any("empty" in item["error"] for item in result["failed"])
    assert len(list(app_context["sessions_dir"].glob("*.session"))) == 2
    assert len(app_context["main"].manager.accounts) == 2


def test_export_sessions_redacts_metadata(app_context: dict):
    account = add_account(app_context, "acc-1", "Primary")
    account.phone = "+10000000000"
    app_context["main"].manager._save_accounts()
    session_path = app_context["sessions_dir"] / f"{account.session_name}.session"
    session_path.parent.mkdir(parents=True, exist_ok=True)
    session_path.write_bytes(b"fake sqlite bytes")

    response = app_context["client"].post(
        "/api/sessions/export",
        json={"account_ids": [account.id], "redact_phone": True},
    )

    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        assert f"sessions/{account.session_name}.session" in names
        assert "accounts-export.json" in names
        assert "README-SECURITY.txt" in names
        metadata = archive.read("accounts-export.json").decode()
        assert "+10000000000" not in metadata


def test_export_preflight_leaves_no_partial_archive(app_context: dict) -> None:
    first = add_account(app_context, "acc-1", "First")
    second = add_account(app_context, "acc-2", "Second")
    app_context["sessions_dir"].mkdir(parents=True, exist_ok=True)
    (app_context["sessions_dir"] / f"{first.session_name}.session").write_bytes(b"fake sqlite bytes")

    response = app_context["client"].post(
        "/api/sessions/export",
        json={"account_ids": [first.id, second.id], "redact_phone": True},
    )
    assert response.status_code == 400
    exports = app_context["data_dir"] / "exports"
    assert not list(exports.iterdir())


def test_export_write_failure_cleans_temporary_archive(app_context: dict, monkeypatch) -> None:
    account = add_account(app_context, "acc-1", "Primary")
    app_context["sessions_dir"].mkdir(parents=True, exist_ok=True)
    (app_context["sessions_dir"] / f"{account.session_name}.session").write_bytes(b"fake sqlite bytes")
    service = __import__("telemanager.sessions_service", fromlist=["export_sessions"])

    monkeypatch.setattr(zipfile.ZipFile, "write", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("disk")))
    with pytest.raises(OSError, match="disk"):
        service.export_sessions(app_context["main"].manager, [account.id])
    assert not list((app_context["data_dir"] / "exports").iterdir())


def test_export_names_are_unique_within_same_second(app_context: dict) -> None:
    account = add_account(app_context, "acc-1", "Primary")
    app_context["sessions_dir"].mkdir(parents=True, exist_ok=True)
    (app_context["sessions_dir"] / f"{account.session_name}.session").write_bytes(b"fake sqlite bytes")
    service = __import__("telemanager.sessions_service", fromlist=["export_sessions"])

    first = service.export_sessions(app_context["main"].manager, [account.id])
    second = service.export_sessions(app_context["main"].manager, [account.id])
    assert first != second
    with zipfile.ZipFile(first), zipfile.ZipFile(second):
        pass


def test_rename_and_delete_session_file(app_context: dict):
    account = add_account(app_context, "acc-1", "Primary")
    old_path = app_context["sessions_dir"] / f"{account.session_name}.session"
    old_path.parent.mkdir(parents=True, exist_ok=True)
    old_path.write_bytes(b"fake")

    response = app_context["client"].post(
        f"/api/sessions/{account.id}/rename-file",
        json={"session_name": "renamed_session"},
    )
    assert response.status_code == 200
    assert not old_path.exists()
    assert (app_context["sessions_dir"] / "renamed_session.session").exists()

    delete_response = app_context["client"].delete(f"/api/accounts/{account.id}")
    assert delete_response.status_code == 200
    assert not (app_context["sessions_dir"] / "renamed_session.session").exists()


def test_validate_account_route_registered(app_context: dict):
    # The per-account Validate button (accounts-table.tsx) POSTs here. Regression:
    # this handler once lost its @router.post decorator in a merge, silently 404ing
    # the button. Assert the route stays registered rather than the handler body.
    app = app_context["main"].app
    registered = {(route.path, method) for route in app.routes for method in getattr(route, "methods", None) or ()}
    assert ("/api/accounts/{account_id}/validate", "POST") in registered
