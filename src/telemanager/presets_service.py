from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from .config import ACTION_PRESETS_FILE, read_json, write_json

NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{1,78}[A-Za-z0-9]$")


def list_action_presets() -> list[dict[str, Any]]:
    presets = read_json(ACTION_PRESETS_FILE, [])
    return sorted(presets, key=lambda item: item.get("updated_at", ""), reverse=True)


def save_action_preset(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    clean_name = name.strip()
    if not NAME_PATTERN.match(clean_name):
        raise ValueError(
            "Preset name must be 3-80 characters and use letters, numbers, spaces, dots, dashes, or underscores."
        )

    presets = list_action_presets()
    now = datetime.now(UTC).isoformat()
    preset_id = slug_id(clean_name)
    preset = {
        "id": preset_id,
        "name": clean_name,
        "created_at": now,
        "updated_at": now,
        "queue": payload,
    }

    for index, existing in enumerate(presets):
        if existing.get("id") == preset_id:
            preset["created_at"] = existing.get("created_at", now)
            presets[index] = preset
            write_json(ACTION_PRESETS_FILE, presets)
            return preset

    presets.append(preset)
    write_json(ACTION_PRESETS_FILE, presets)
    return preset


def delete_action_preset(preset_id: str) -> None:
    presets = list_action_presets()
    remaining = [preset for preset in presets if preset.get("id") != preset_id]
    if len(remaining) == len(presets):
        raise ValueError("Preset was not found.")
    write_json(ACTION_PRESETS_FILE, remaining)


def slug_id(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or str(uuid.uuid4())
