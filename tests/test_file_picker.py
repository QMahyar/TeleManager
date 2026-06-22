from __future__ import annotations


def test_pick_path_returns_selected_path(app_context: dict, client, monkeypatch) -> None:
    async def fake_pick(kind, title):
        assert kind == "file"
        return "E:/photos/wolf.jpg"

    monkeypatch.setattr(app_context["main"], "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "file"})
    assert response.status_code == 200
    assert response.json() == {"path": "E:/photos/wolf.jpg", "supported": True}


def test_pick_path_null_on_cancel(app_context: dict, client, monkeypatch) -> None:
    async def fake_pick(kind, title):
        return None

    monkeypatch.setattr(app_context["main"], "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "directory"})
    assert response.status_code == 200
    assert response.json()["path"] is None


def test_pick_path_unsupported_returns_501(app_context: dict, client, monkeypatch) -> None:
    main = app_context["main"]

    async def fake_pick(kind, title):
        raise main.PickerUnavailable("No native file picker is available on this system.")

    monkeypatch.setattr(main, "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "file"})
    assert response.status_code == 501
    assert "picker" in response.json()["detail"].lower()


def test_pick_path_busy_returns_409(app_context: dict, client, monkeypatch) -> None:
    main = app_context["main"]

    async def fake_pick(kind, title):
        raise main.PickerBusy("A file dialog is already open. Close it first.")

    monkeypatch.setattr(main, "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "file"})
    assert response.status_code == 409
