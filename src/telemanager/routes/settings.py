"""Action metadata + safety/app settings (/api/actions/meta, /api/settings/*)."""
from __future__ import annotations

from fastapi import APIRouter

from ..action_queue_service import SafetySettingsRequest, actions_meta_payload, safety_defaults, save_safety_settings
from ..app_settings import AppSettingsRequest, app_settings, save_app_settings

router = APIRouter()


@router.get("/api/actions/meta")
def get_actions_meta() -> dict:
    """Per-action metadata (risk tier, valid targets, flags) + resolved tier delays.

    Single source the frontend reads so it never re-hardcodes per-action behaviour
    and can show timing badges / estimate run durations from canonical numbers.
    """
    return actions_meta_payload()


@router.get("/api/settings/safety")
def get_safety_settings() -> dict:
    return {"settings": safety_defaults()}


@router.post("/api/settings/safety")
def set_safety_settings(request: SafetySettingsRequest) -> dict:
    return {"settings": save_safety_settings(request)}


@router.get("/api/settings/app")
def get_app_settings() -> dict:
    return {"settings": app_settings()}


@router.post("/api/settings/app")
def set_app_settings(request: AppSettingsRequest) -> dict:
    return {"settings": save_app_settings(request)}
