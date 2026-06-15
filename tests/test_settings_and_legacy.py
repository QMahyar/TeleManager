from __future__ import annotations


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


def test_legacy_start_stop_routes_return_gone(client):
    form_response = client.post("/api/accounts/start", data={"account_id": "acc-1"})
    assert form_response.status_code == 410
    assert "deprecated" in form_response.json()["detail"]

    body_response = client.post("/api/accounts/start-selected", json=["acc-1"])
    assert body_response.status_code == 410
    assert "deprecated" in body_response.json()["detail"]
