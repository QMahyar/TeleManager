from __future__ import annotations

import io
import zipfile

from conftest import add_account


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


def test_cached_dialogs_unknown_account_fails(app_context: dict):
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    try:
        dialogs_service.list_cached_dialogs(app_context["main"].manager, "missing")
    except ValueError as exc:
        assert "Account was not found" in str(exc)
    else:
        raise AssertionError("Expected missing account to fail")


def test_import_session_rejects_non_session_file(client):
    response = client.post(
        "/api/sessions/import-file",
        data={"label": "Bad Import"},
        files={"file": ("bad.txt", b"not a session", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only .session files can be imported."


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
