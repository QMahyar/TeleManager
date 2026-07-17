from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

from .documents import app_settings_doc

if TYPE_CHECKING:
    from .accounts import AccountRecord


class AppSettingsRequest(BaseModel):
    """Backend-persisted display/runtime preferences (global, not per-account).

    Unlike theme/accent (browser-local), `show_dialog_photos` lives here because it
    gates a server-side action — whether `fetch_dialogs` downloads profile photos at
    all — so it must be readable by the backend, not just the UI.
    """

    show_dialog_photos: bool = True


def app_settings() -> dict:
    """Current app settings, with any missing keys filled by the model defaults."""
    settings = app_settings_doc.read({})
    return AppSettingsRequest(**settings).model_dump()


def save_app_settings(request: AppSettingsRequest) -> dict:
    updates = request.model_dump()
    with app_settings_doc.mutate({}) as settings:
        settings.update(updates)
    return app_settings()


def resolve_photos_enabled(account: AccountRecord, global_show: bool) -> bool:
    """Whether dialog photos are active for this account.

    Per-account `photos_mode` overrides the global default: "on"/"off" force the
    choice, "default" (the initial value) defers to `global_show`.
    """
    mode = getattr(account, "photos_mode", "default")
    if mode == "on":
        return True
    if mode == "off":
        return False
    return global_show
