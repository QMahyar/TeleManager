"""Version/update checks + local-machine system actions (/api/version, /api/updates/*, /api/system/*, /api/app/*)."""
from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import __version__
from ..file_picker import PickerBusy, PickerUnavailable, pick_path

router = APIRouter()

GITHUB_REPO = "QMahyar/TeleManager"
GITHUB_LATEST_RELEASE_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_RELEASES_URL = f"https://github.com/{GITHUB_REPO}/releases"


class PickPathRequest(BaseModel):
    kind: Literal["file", "directory"] = "file"
    title: str | None = Field(default=None, max_length=200)


@router.get("/api/version")
def get_version() -> dict:
    return {"version": __version__, "repo": GITHUB_REPO, "releases_url": GITHUB_RELEASES_URL}


def _parse_semver(value: str) -> tuple[int, ...]:
    cleaned = value.strip().lstrip("vV").split("+", 1)[0].split("-", 1)[0]
    parts: list[int] = []
    for chunk in cleaned.split("."):
        try:
            parts.append(int(chunk))
        except ValueError:
            break
    return tuple(parts) or (0,)


@router.get("/api/updates/check")
def check_for_updates() -> dict:
    request = urllib.request.Request(
        GITHUB_LATEST_RELEASE_API,
        headers={"Accept": "application/vnd.github+json", "User-Agent": f"TeleManager/{__version__}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 (fixed https URL)
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(status_code=404, detail="No published releases found yet.") from exc
        raise HTTPException(status_code=502, detail="Could not reach GitHub to check for updates.") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach GitHub to check for updates.") from exc

    latest_tag = str(payload.get("tag_name") or "").strip()
    latest_version = latest_tag.lstrip("vV")
    update_available = bool(latest_version) and _parse_semver(latest_version) > _parse_semver(__version__)
    return {
        "current": __version__,
        "latest": latest_version or None,
        "update_available": update_available,
        "html_url": payload.get("html_url") or GITHUB_RELEASES_URL,
        "published_at": payload.get("published_at"),
        "releases_url": GITHUB_RELEASES_URL,
    }


@router.post("/api/system/pick-path")
async def pick_system_path(request: PickPathRequest) -> dict:
    """Open a native OS file/folder dialog on this machine and return the chosen path.

    Safe because the server is bound to 127.0.0.1 for a single local operator and the
    dialog requires a human at the keyboard to make a selection — it cannot be driven
    by a remote caller. ``path`` is null when the user cancels the dialog.
    """
    try:
        path = await pick_path(request.kind, request.title)
    except PickerBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PickerUnavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return {"path": path, "supported": True}


@router.post("/api/app/shutdown")
def shutdown_app() -> dict:
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return {"ok": True}
