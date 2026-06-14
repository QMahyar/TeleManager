from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .accounts import AccountManager
from .config import CONFIG_FILE, read_json, write_json

STATIC_DIR = Path(__file__).resolve().parent / "static"
ACCOUNT_IDS_BODY = Body(...)
manager = AccountManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await manager.shutdown()


app = FastAPI(title="TeleManager", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


@app.get("/api/config")
def get_config() -> dict:
    config = read_json(CONFIG_FILE, {})
    return {"api_id": config.get("api_id"), "api_hash_configured": bool(config.get("api_hash"))}


@app.post("/api/config")
def set_config(api_id: int = Form(...), api_hash: str = Form(...)) -> dict:
    write_json(CONFIG_FILE, {"api_id": api_id, "api_hash": api_hash.strip()})
    return {"ok": True}


@app.get("/api/accounts")
def list_accounts() -> dict:
    return {"accounts": manager.list_accounts()}


@app.post("/api/accounts/login")
async def login_account(phone: str = Form(...), label: str = Form(default="")) -> dict:
    account = await manager.start_login(phone=phone, label=label or None)
    return {"account": account.__dict__}


@app.post("/api/accounts/confirm-code")
async def confirm_code(account_id: str = Form(...), code: str = Form(...)) -> dict:
    try:
        account = await manager.confirm_code(account_id, code)
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/confirm-password")
async def confirm_password(account_id: str = Form(...), password: str = Form(...)) -> dict:
    try:
        account = await manager.confirm_password(account_id, password)
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/start")
async def start_account(account_id: str = Form(...)) -> dict:
    try:
        account = await manager.start_account(account_id)
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/stop")
async def stop_account(account_id: str = Form(...)) -> dict:
    try:
        account = await manager.stop_account(account_id)
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/logout")
async def logout_account(account_id: str = Form(...)) -> dict:
    try:
        account = await manager.logout_account(account_id)
        return {"account": account.__dict__}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/accounts/start-selected")
async def start_selected(account_ids: list[str] = ACCOUNT_IDS_BODY) -> dict:
    accounts = await manager.start_many(account_ids)
    return {"accounts": [account.__dict__ for account in accounts]}


@app.post("/api/accounts/stop-selected")
async def stop_selected(account_ids: list[str] = ACCOUNT_IDS_BODY) -> dict:
    accounts = await manager.stop_many(account_ids)
    return {"accounts": [account.__dict__ for account in accounts]}


@app.post("/api/accounts/start-all")
async def start_all() -> dict:
    accounts = await manager.start_many()
    return {"accounts": [account.__dict__ for account in accounts]}


@app.post("/api/accounts/stop-all")
async def stop_all() -> dict:
    accounts = await manager.stop_many()
    return {"accounts": [account.__dict__ for account in accounts]}


@app.exception_handler(Exception)
async def general_exception_handler(_: object, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("telemanager.main:app", host="127.0.0.1", port=8000, reload=True)
