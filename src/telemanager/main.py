from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .action_queue_service import ActionQueueRequest, now_iso
from .app_password import clear_expired_sessions, is_password_enabled, is_session_valid
from .routes import (
    account_settings,
    accounts,
    actions,
    activity,
    auth,
    config,
    dialogs,
    schedules,
    settings,
    static,
    system,
)
from .routes.static import FRONTEND_DIST_DIR
from .runtime import active_sessions, manager, queue_runs, scheduler

# manager / queue_runs / scheduler / active_sessions are the shared singletons defined
# in runtime.py; main and every routes/* module import the SAME instances from there.
# Re-exported below (__all__) so existing `main.manager` / `main.queue_runs` callers
# (and the test harness) still resolve them on the main module.

__all__ = [
    "ALLOWED_HOSTS",
    "ActionQueueRequest",
    "active_sessions",
    "app",
    "manager",
    "now_iso",
    "queue_runs",
    "scheduler",
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    await scheduler.start()
    try:
        yield
    finally:
        await scheduler.stop()
        await manager.shutdown()


app = FastAPI(title="TeleManager", lifespan=lifespan)

# Local-only guard. With no auth layer, the browser is a confused deputy: any
# page the operator visits can POST to http://127.0.0.1:8000, and DNS rebinding
# can make an attacker's page same-origin with us. Validating the Host header
# defeats rebinding (the request still carries the attacker's hostname). The
# matcher strips the port, so bare hostnames cover ":8000" and the Vite dev
# proxy (which forwards the browser's localhost host). Override only if you have
# added auth/TLS and understand the AGENTS.md "local only" non-negotiable.
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("TELEMANAGER_ALLOWED_HOSTS", "127.0.0.1,localhost,::1").split(",")
    if host.strip()
]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Check app password if enabled. Exempt auth endpoints and static assets.

    When a password is set and the session is missing, `/api/*` (except
    `/api/auth/*`) returns 401 JSON. Non-API paths still load so the SPA can
    render a login gate — the browser needs HTML/JS before it can authenticate.
    """
    # Skip auth for login/status endpoints and static files
    if request.url.path.startswith(("/api/auth/", "/assets/", "/favicon.ico")):
        return await call_next(request)

    # If password protection is disabled, allow all requests
    if not is_password_enabled():
        return await call_next(request)

    # Check session cookie
    session_token = request.cookies.get("telemanager_session")
    clear_expired_sessions(active_sessions)

    if session_token and is_session_valid(session_token, active_sessions):
        return await call_next(request)

    # SPA shell + brand assets must load without a session so the login gate runs.
    # Only the API is gated — never return 200 for /api/* without a valid session.
    if not request.url.path.startswith("/api/"):
        return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={"detail": "Authentication required. Log in to continue."},
    )


if (FRONTEND_DIST_DIR / "assets").exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")

# API routers first, then the static/frontend router last — it owns the "/" and
# "/{filename}" routes. (Order isn't strictly required since /{filename} is single-
# segment and can't match /api/*, but it keeps the catch-all visibly last.)
for _module in (
    auth, config, settings, accounts, account_settings,
    dialogs, actions, schedules, activity, system, static,
):
    app.include_router(_module.router)


@app.exception_handler(TimeoutError)
async def timeout_exception_handler(_: object, exc: TimeoutError) -> JSONResponse:
    # Telethon connect/auth timeouts carry an actionable message (check clock/network).
    # Without this they hit the generic handler below and the operator sees only a bare
    # "internal error" 500 — the common case for accounts on a filtered network.
    return JSONResponse(
        status_code=504,
        content={"detail": str(exc) or "Telegram request timed out. Check your network and try again."},
    )


@app.exception_handler(Exception)
async def general_exception_handler(_: object, exc: Exception) -> JSONResponse:
    logging.getLogger("telemanager").exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Check server logs for details."},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("telemanager.main:app", host="127.0.0.1", port=8000, reload=True)
