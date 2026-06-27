"""Telegram API credential config (/api/config)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..documents import config_doc

router = APIRouter()


@router.get("/api/config")
def get_config() -> dict:
    config = config_doc.read({})
    return {"api_id": config.get("api_id"), "api_hash_configured": bool(config.get("api_hash"))}


@router.post("/api/config")
async def set_config(request: Request) -> dict:
    payload = await config_payload(request)
    # Merge payload over existing under the file lock so a concurrent write can't be
    # lost. A bad/missing hash raises inside mutate(), so nothing is persisted.
    with config_doc.mutate({}) as config:
        api_id = parse_api_id(payload.get("api_id", config.get("api_id")))
        api_hash = str(payload.get("api_hash") or "").strip() or config.get("api_hash")
        if not api_hash:
            raise HTTPException(status_code=400, detail="Telegram API hash is required.")
        config.clear()
        config["api_id"] = api_id
        config["api_hash"] = str(api_hash).strip()
    return {"ok": True, "api_id": api_id, "api_hash_configured": True}


async def config_payload(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
        return payload if isinstance(payload, dict) else {}
    form = await request.form()
    return dict(form)


def parse_api_id(value: object) -> int:
    try:
        api_id = int(str(value or "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Telegram API ID must be a positive number.") from exc
    if api_id < 1:
        raise HTTPException(status_code=400, detail="Telegram API ID must be a positive number.")
    return api_id
