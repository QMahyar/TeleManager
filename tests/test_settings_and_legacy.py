from __future__ import annotations

from fastapi.testclient import TestClient


def test_write_json_replaces_files_atomically(app_context: dict):
    config = app_context["config"]
    target = config.DATA_DIR / "atomic.json"

    config.write_json(target, {"ok": True})

    assert config.read_json(target, {}) == {"ok": True}
    assert not target.with_suffix(".json.tmp").exists()


def test_index_html_is_not_cached(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"


def test_general_exception_handler_hides_internal_detail(app_context: dict):
    main = app_context["main"]

    @main.app.get("/api/test-unhandled-error")
    def _test_unhandled_error():
        raise RuntimeError("secret internal detail")

    client = TestClient(main.app, base_url="http://127.0.0.1", raise_server_exceptions=False)
    response = client.get("/api/test-unhandled-error")

    assert response.status_code == 500
    assert response.json()["detail"] == "An internal error occurred. Check server logs for details."


def test_api_config_accepts_json_and_preserves_existing_hash(app_context: dict):
    client = app_context["client"]
    config = app_context["config"]

    create_response = client.post("/api/config", json={"api_id": "12345", "api_hash": "abc123"})
    update_response = client.post("/api/config", json={"api_id": "67890", "api_hash": ""})

    assert create_response.status_code == 200
    assert update_response.status_code == 200
    assert update_response.json() == {"ok": True, "api_id": 67890, "api_hash_configured": True}
    assert config.read_json(config.CONFIG_FILE, {}) == {"api_id": 67890, "api_hash": "abc123"}


def test_api_config_rejects_missing_hash_on_first_save(client):
    response = client.post("/api/config", json={"api_id": "12345", "api_hash": ""})

    assert response.status_code == 400
    assert response.json()["detail"] == "Telegram API hash is required."


def test_login_without_api_settings_returns_actionable_400(client):
    response = client.post("/api/accounts/login", data={"phone": "+15551234567", "label": "Main"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Telegram API ID and API hash are not configured."


def test_login_start_failure_returns_actionable_400(app_context: dict):
    async def fail_start_login(*, phone: str, label: str | None = None):
        raise ValueError("Telegram did not send a login code: test failure")

    app_context["main"].manager.start_login = fail_start_login
    response = app_context["client"].post("/api/accounts/login", data={"phone": "+15551234567"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Telegram did not send a login code: test failure"


def test_safety_settings_round_trip_and_queue_defaults(client):
    response = client.post(
        "/api/settings/safety",
        json={"delay_between_accounts": 6, "delay_between_actions": 12, "max_operations": 40},
    )
    assert response.status_code == 200
    assert response.json()["settings"]["delay_between_accounts"] == 6

    settings = client.get("/api/settings/safety")
    assert settings.status_code == 200
    assert settings.json()["settings"] == response.json()["settings"]


def test_safety_settings_rejects_unsafe_values(client):
    response = client.post(
        "/api/settings/safety",
        json={"delay_between_accounts": 0, "delay_between_actions": 12, "max_operations": 40},
    )
    assert response.status_code == 422
