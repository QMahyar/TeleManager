from __future__ import annotations

import multiprocessing
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

# PyInstaller windowed builds (console=False) leave sys.stdout/stderr as None.
# uvicorn's logging formatter calls .isatty() on them and crashes with
# "Unable to configure formatter 'default'". Redirect to a logfile so the
# streams always exist and GUI failures stay debuggable.
if sys.stdout is None or sys.stderr is None:
    _log_path = Path(os.environ.get("TELEMANAGER_DATA_DIR", Path.cwd())) / "telemanager.log"
    _log_path.parent.mkdir(parents=True, exist_ok=True)
    _sink = open(_log_path, "a", encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = _sink
    if sys.stderr is None:
        sys.stderr = _sink

import uvicorn


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def frontend_dir() -> Path:
    # PyInstaller onedir bundles datas under _internal/ (sys._MEIPASS), not next
    # to the executable, so resolve the frontend from _MEIPASS when frozen.
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass) / "web"
    return app_dir() / "web"


def main() -> None:
    root = app_dir()
    os.environ.setdefault("TELEMANAGER_DATA_DIR", str(root / "data"))
    os.environ.setdefault("TELEMANAGER_SESSIONS_DIR", str(root / "sessions"))
    os.environ.setdefault("TELEMANAGER_FRONTEND_DIST_DIR", str(frontend_dir()))

    def open_browser() -> None:
        time.sleep(1)
        webbrowser.open("http://127.0.0.1:8000")

    threading.Thread(target=open_browser, daemon=True).start()

    from telemanager.main import app

    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False, workers=1)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
