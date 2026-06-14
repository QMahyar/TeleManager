from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("TELEMANAGER_DATA_DIR", ROOT_DIR / "data"))
SESSIONS_DIR = Path(os.getenv("TELEMANAGER_SESSIONS_DIR", ROOT_DIR / "sessions"))
CONFIG_FILE = DATA_DIR / "config.json"
ACCOUNTS_FILE = DATA_DIR / "accounts.json"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any) -> Any:
    ensure_dirs()
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json(path: Path, value: Any) -> None:
    ensure_dirs()
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")
