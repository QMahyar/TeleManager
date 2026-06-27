from __future__ import annotations

import asyncio
import importlib
import sys

from telemanager import file_picker


def _system_routes():
    # The /api/system/pick-path handler lives in routes.system and resolves pick_path
    # in that module's namespace, so patch it there (not on telemanager.main).
    return importlib.import_module("telemanager.routes.system")


def test_pick_path_returns_selected_path(app_context: dict, client, monkeypatch) -> None:
    async def fake_pick(kind, title):
        assert kind == "file"
        return "E:/photos/wolf.jpg"

    monkeypatch.setattr(_system_routes(), "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "file"})
    assert response.status_code == 200
    assert response.json() == {"path": "E:/photos/wolf.jpg", "supported": True}


def test_pick_path_null_on_cancel(app_context: dict, client, monkeypatch) -> None:
    async def fake_pick(kind, title):
        return None

    monkeypatch.setattr(_system_routes(), "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "directory"})
    assert response.status_code == 200
    assert response.json()["path"] is None


def test_pick_path_unsupported_returns_501(app_context: dict, client, monkeypatch) -> None:
    main = app_context["main"]

    async def fake_pick(kind, title):
        raise main.PickerUnavailable("No native file picker is available on this system.")

    monkeypatch.setattr(_system_routes(), "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "file"})
    assert response.status_code == 501
    assert "picker" in response.json()["detail"].lower()


def test_pick_path_busy_returns_409(app_context: dict, client, monkeypatch) -> None:
    main = app_context["main"]

    async def fake_pick(kind, title):
        raise main.PickerBusy("A file dialog is already open. Close it first.")

    monkeypatch.setattr(_system_routes(), "pick_path", fake_pick)
    response = client.post("/api/system/pick-path", json={"kind": "file"})
    assert response.status_code == 409


def test_run_falls_back_to_thread_when_loop_lacks_subprocess(monkeypatch) -> None:
    # Windows SelectorEventLoop (uvicorn --reload / workers>1) raises
    # NotImplementedError from create_subprocess_exec; _run must transparently
    # fall back to the blocking runner with the same arguments.
    seen: dict[str, object] = {}

    async def boom(argv, *, no_window):
        raise NotImplementedError

    def fake_blocking(argv, no_window):
        seen["argv"] = argv
        seen["no_window"] = no_window
        return (0, "C:/picked.jpg", "")

    monkeypatch.setattr(file_picker, "_run_async", boom)
    monkeypatch.setattr(file_picker, "_run_blocking", fake_blocking)

    result = asyncio.run(file_picker._run(["dialog.exe"], no_window=True))

    assert result == (0, "C:/picked.jpg", "")
    assert seen == {"argv": ["dialog.exe"], "no_window": True}


def test_run_blocking_captures_stdout() -> None:
    # The thread fallback returns the child's (returncode, stdout, stderr) just
    # like the async path. Use the test interpreter for a portable, dialog-free child.
    code, out, err = file_picker._run_blocking(
        [sys.executable, "-c", "import sys; sys.stdout.write('picked')"], False
    )
    assert code == 0
    assert out == "picked"
