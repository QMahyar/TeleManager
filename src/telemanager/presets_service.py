from __future__ import annotations

import re
import uuid
from typing import Any

from .config import now_iso
from .documents import presets_doc

NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{1,78}[A-Za-z0-9]$")


def list_action_presets() -> list[dict[str, Any]]:
    presets = presets_doc.read([])
    return sorted(presets, key=lambda item: item.get("updated_at", ""), reverse=True)


def save_action_preset(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    clean_name = name.strip()
    if not NAME_PATTERN.match(clean_name):
        raise ValueError(
            "Preset name must be 3-80 characters and use letters, numbers, spaces, dots, dashes, or underscores."
        )

    now = now_iso()
    preset_id = slug_id(clean_name)
    preset = {
        "id": preset_id,
        "name": clean_name,
        "created_at": now,
        "updated_at": now,
        "queue": payload,
    }

    # Hold the file lock across the read -> upsert -> write so two saves can't
    # clobber each other (last-write-wins). Order in storage doesn't matter:
    # list_action_presets sorts on read.
    with presets_doc.mutate([]) as presets:
        for index, existing in enumerate(presets):
            if existing.get("id") == preset_id:
                preset["created_at"] = existing.get("created_at", now)
                presets[index] = preset
                break
        else:
            presets.append(preset)
    return preset


def delete_action_preset(preset_id: str) -> None:
    with presets_doc.mutate([]) as presets:
        remaining = [preset for preset in presets if preset.get("id") != preset_id]
        if len(remaining) == len(presets):
            # Raising inside mutate() skips the write — nothing is persisted.
            raise ValueError("Preset was not found.")
        presets[:] = remaining


def slug_id(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or str(uuid.uuid4())
