"""App password authentication routes (/api/auth/*)."""
from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..app_password import (
    create_session,
    is_password_enabled,
    set_app_password,
    verify_app_password,
)
from ..audit_service import log_event
from ..runtime import active_sessions

router = APIRouter()


class PasswordSetupRequest(BaseModel):
    password: str = Field(min_length=0, max_length=128)
    current_password: str | None = Field(default=None, max_length=128)


@router.get("/api/auth/status")
def auth_status() -> dict:
    """Check if app password is enabled."""
    return {"password_enabled": is_password_enabled()}


@router.post("/api/auth/login")
def login(password: str = Form(...), response: Response = None) -> dict:
    """Verify password and create session."""
    if not verify_app_password(password):
        log_event("auth_failed", "Failed login attempt", "system", {})
        raise HTTPException(status_code=401, detail="Invalid password.")

    token = create_session(active_sessions)
    response.set_cookie(
        key="telemanager_session",
        value=token,
        httponly=True,
        secure=False,  # Local app, no HTTPS
        samesite="lax",
        max_age=24 * 3600,  # 24 hours
    )
    log_event("auth_success", "Successful login", "system", {})
    return {"ok": True}


@router.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict:
    """Clear session cookie and drop the server-side token."""
    token = request.cookies.get("telemanager_session")
    if token:
        active_sessions.pop(token, None)
    response.delete_cookie("telemanager_session")
    log_event("auth_logout", "User logged out", "system", {})
    return {"ok": True}


@router.post("/api/auth/setup")
def setup_password(request: PasswordSetupRequest) -> dict:
    """Enable, rotate, or disable app password.

    First enable (password currently off) needs no current password.
    When a password is already set, `current_password` must match.
    Empty `password` disables protection (only when authorized).
    """
    new_password = request.password.strip()
    if is_password_enabled():
        current = (request.current_password or "").strip()
        if not current:
            raise HTTPException(status_code=401, detail="Current password is required.")
        if not verify_app_password(current):
            raise HTTPException(status_code=401, detail="Invalid current password.")

    if new_password:
        set_app_password(new_password)
        log_event("auth_enabled", "App password enabled", "system", {})
        return {"password_enabled": True}

    set_app_password("")
    log_event("auth_disabled", "App password disabled", "system", {})
    return {"password_enabled": False}
