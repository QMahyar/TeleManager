from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

# Re-exported on `telemanager.main` for tests / external callers that reach for these
# (the request handlers themselves now live in routes/*). Declared in __all__ so they
# read as intentional re-exports rather than unused imports.
from .action_queue_service import ActionQueueRequest, now_iso
from .file_picker import PickerBusy, PickerUnavailable
from .routes import accounts, actions, activity, config, dialogs, schedules, settings, static, system
from .routes.static import FRONTEND_DIST_DIR
from .runtime import manager, queue_runs, scheduler

__all__ = [
    "ALLOWED_HOSTS",
    "ActionQueueRequest",
    "PickerBusy",
    "PickerUnavailable",
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

if (FRONTEND_DIST_DIR / "assets").exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")

# API routers first, then the static/frontend router last — it owns the "/" and
# "/{filename}" routes. (Order isn't strictly required since /{filename} is single-
# segment and can't match /api/*, but it keeps the catch-all visibly last.)
for _module in (config, settings, accounts, dialogs, actions, schedules, activity, system, static):
    app.include_router(_module.router)


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
