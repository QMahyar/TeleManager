from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import add_account


def _modules():
    app_settings = __import__("telemanager.app_settings", fromlist=["app_settings"])
    dialogs_service = __import__("telemanager.dialogs_service", fromlist=["dialogs_service"])
    sessions_service = __import__("telemanager.sessions_service", fromlist=["sessions_service"])
    return app_settings, dialogs_service, sessions_service


# --- global app settings -----------------------------------------------------


def test_app_settings_round_trip_defaults_on(client):
    default = client.get("/api/settings/app")
    assert default.status_code == 200
    assert default.json()["settings"] == {"show_dialog_photos": True}

    saved = client.post("/api/settings/app", json={"show_dialog_photos": False})
    assert saved.status_code == 200
    assert saved.json()["settings"] == {"show_dialog_photos": False}

    assert client.get("/api/settings/app").json()["settings"] == {"show_dialog_photos": False}


def test_resolve_photos_enabled_truth_table(app_context: dict):
    app_settings, _, _ = _modules()
    resolve = app_settings.resolve_photos_enabled

    # Per-account override wins regardless of the global default…
    assert resolve(SimpleNamespace(photos_mode="on"), False) is True
    assert resolve(SimpleNamespace(photos_mode="off"), True) is False
    # …"default" defers to the global default.
    assert resolve(SimpleNamespace(photos_mode="default"), True) is True
    assert resolve(SimpleNamespace(photos_mode="default"), False) is False


# --- photo download during fetch ---------------------------------------------


class _FakePhoto:
    photo_id = 42


class _FakeEntity:
    id = 777
    username = None
    bot = False
    megagroup = False
    broadcast = False
    photo = _FakePhoto()


class _FakeDialog:
    def __init__(self) -> None:
        self.entity = _FakeEntity()
        self.name = "Test Chat"
        self.unread_count = 0
        self.pinned = False
        self.archived = False


class _FakeClient:
    def __init__(self) -> None:
        self.downloads: list[str] = []

    async def iter_dialogs(self, limit=0):
        yield _FakeDialog()

    async def download_profile_photo(self, entity, file, download_big=True):
        self.downloads.append(file)
        Path(file).write_bytes(b"\xff\xd8\xff\xee fake-jpeg-bytes")
        return file

    def disconnect(self):
        return None


def _wire_fake_client(manager, monkeypatch: pytest.MonkeyPatch) -> _FakeClient:
    fake = _FakeClient()
    monkeypatch.setattr(manager, "get_api_credentials", lambda: (1, "hash"))
    monkeypatch.setattr(manager, "_new_client", lambda *a, **k: fake)

    async def _connect(_client):
        return None

    async def _authorized(_client):
        return True

    monkeypatch.setattr(manager, "_connect_client", _connect)
    monkeypatch.setattr(manager, "_is_user_authorized", _authorized)
    return fake


def test_fetch_downloads_and_caches_photo_when_enabled(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
):
    account = add_account(app_context, "acc-1", "Primary")
    _, dialogs_service, _ = _modules()
    manager = app_context["main"].manager
    fake = _wire_fake_client(manager, monkeypatch)

    payload = asyncio.run(dialogs_service.fetch_dialogs(manager, account.id, limit=10))

    dialog = payload["dialogs"][0]
    assert dialog["has_photo"] is True
    assert dialog["photo_id"] == 42
    assert dialogs_service.avatar_path(account.id, 777).is_file()
    assert len(fake.downloads) == 1

    # A re-fetch with an unchanged photo_id must not re-download the avatar.
    asyncio.run(dialogs_service.fetch_dialogs(manager, account.id, limit=10))
    assert len(fake.downloads) == 1


def test_fetch_skips_photos_when_globally_disabled(
    app_context: dict, monkeypatch: pytest.MonkeyPatch
):
    account = add_account(app_context, "acc-1", "Primary")
    _, dialogs_service, _ = _modules()
    config = app_context["config"]
    config.write_json(config.APP_SETTINGS_FILE, {"show_dialog_photos": False})

    manager = app_context["main"].manager
    fake = _wire_fake_client(manager, monkeypatch)

    payload = asyncio.run(dialogs_service.fetch_dialogs(manager, account.id, limit=10))

    assert payload["dialogs"][0]["has_photo"] is False
    assert fake.downloads == []
    assert not dialogs_service.avatar_path(account.id, 777).exists()


# --- serving cached photos ----------------------------------------------------


def test_get_dialog_photo_serves_and_404s(app_context: dict):
    account = add_account(app_context, "acc-1", "Primary")
    config = app_context["config"]
    client = app_context["client"]

    photo_dir = config.AVATARS_DIR / account.id
    photo_dir.mkdir(parents=True, exist_ok=True)
    (photo_dir / "777.jpg").write_bytes(b"jpeg-bytes")
    # Marked (negative) ids are valid filenames and route segments.
    (photo_dir / "-1001424486089.jpg").write_bytes(b"jpeg-bytes")

    ok = client.get(f"/api/accounts/{account.id}/dialogs/777/photo")
    assert ok.status_code == 200
    assert ok.headers["content-type"] == "image/jpeg"
    assert ok.content == b"jpeg-bytes"

    marked = client.get(f"/api/accounts/{account.id}/dialogs/-1001424486089/photo")
    assert marked.status_code == 200

    assert client.get(f"/api/accounts/{account.id}/dialogs/999/photo").status_code == 404
    assert client.get(f"/api/accounts/{account.id}/dialogs/abc/photo").status_code == 404
    assert client.get("/api/accounts/missing/dialogs/777/photo").status_code == 404


# --- per-account override + cleanup ------------------------------------------


def test_photos_mode_endpoint_sets_and_validates(app_context: dict):
    account = add_account(app_context, "acc-1", "Primary")
    client = app_context["client"]

    ok = client.post(f"/api/accounts/{account.id}/photos-mode", json={"photos_mode": "off"})
    assert ok.status_code == 200
    assert ok.json()["account"]["photos_mode"] == "off"
    assert app_context["main"].manager.accounts[account.id].photos_mode == "off"

    bad = client.post(f"/api/accounts/{account.id}/photos-mode", json={"photos_mode": "bogus"})
    assert bad.status_code == 422

    missing = client.post("/api/accounts/missing/photos-mode", json={"photos_mode": "on"})
    assert missing.status_code == 400


def test_save_app_settings_preserves_password_hash(app_context: dict):
    """Regression: save_app_settings must not wipe password_hash (P001)."""
    client = app_context["client"]

    # 1. Enable the app password.
    response = client.post("/api/auth/setup", json={"password": "secret-pass"})
    assert response.status_code == 200
    assert response.json()["password_enabled"]

    # 2. Clear session and login to get a valid session.
    client.cookies.clear()
    login_resp = client.post("/api/auth/login", data={"password": "secret-pass"})
    assert login_resp.status_code == 200

    # 3. Change an unrelated display setting.
    saved = client.post("/api/settings/app", json={"show_dialog_photos": False})
    assert saved.status_code == 200
    assert saved.json()["settings"] == {"show_dialog_photos": False}

    # 4. Password must still be active.
    assert client.get("/api/auth/status").json()["password_enabled"]

    # 5. Unauthenticated API must be blocked.
    client.cookies.clear()
    assert client.get("/api/config").status_code == 401

    # 6. The public settings endpoint must return the new value and NOT leak
    #    the password_hash.
    login_resp = client.post("/api/auth/login", data={"password": "secret-pass"})
    assert login_resp.status_code == 200

    settings = client.get("/api/settings/app").json()["settings"]
    assert settings == {"show_dialog_photos": False}
    assert "password_hash" not in settings


def test_delete_session_removes_avatar_cache(app_context: dict):
    account = add_account(app_context, "acc-1", "Primary")
    config = app_context["config"]

    photo_dir = config.AVATARS_DIR / account.id
    photo_dir.mkdir(parents=True, exist_ok=True)
    (photo_dir / "777.jpg").write_bytes(b"jpeg-bytes")

    response = app_context["client"].delete(f"/api/accounts/{account.id}")
    assert response.status_code == 200
    assert not photo_dir.exists()
