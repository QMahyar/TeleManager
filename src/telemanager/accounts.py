from __future__ import annotations

import asyncio
import inspect
import re
import uuid
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal, cast

from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)

from .config import ACCOUNTS_FILE, CONFIG_FILE, SESSIONS_DIR, now_iso, read_json, write_json
from .telegram_actions import TelegramAction, TelegramActionResult, run_telegram_action

CONNECT_TIMEOUT_SECONDS = 25
RuntimeStatus = Literal["stopped", "running", "login_pending", "password_pending", "error"]


async def _disconnect(client: TelegramClient) -> None:
    """Disconnect a client, awaiting the coroutine Telethon returns under a running loop.

    TelegramClient.disconnect() returns a coroutine when the event loop is already
    running (always true under uvicorn) and None otherwise. Awaiting the bare call
    is unsafe for the type checker, so route every disconnect through this helper.
    """
    result = client.disconnect()
    if inspect.isawaitable(result):
        await cast("Awaitable[Any]", result)


@dataclass
class AccountRecord:
    id: str
    label: str
    phone: str
    session_name: str
    authorized: bool = False
    status: RuntimeStatus = "stopped"
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    last_error: str | None = None
    source: str = "login"
    created_at: str | None = None
    last_validated_at: str | None = None
    last_dialog_fetch_at: str | None = None
    dialog_count: int = 0


@dataclass
class LoginState:
    account_id: str
    client: TelegramClient
    phone_code_hash: str


class AccountManager:
    def __init__(self) -> None:
        self.accounts: dict[str, AccountRecord] = {}
        self.clients: dict[str, TelegramClient] = {}
        self.pending_logins: dict[str, LoginState] = {}
        self.lock = asyncio.Lock()
        # Per-account session locks serialize use of a single `.session` file. The
        # SQLite-backed Telethon session cannot be opened twice concurrently, so a
        # run holds its accounts' locks for its whole lifetime (see session_guard).
        # `_busy_accounts` mirrors the held locks for a non-blocking busy check.
        self._session_locks: dict[str, asyncio.Lock] = {}
        self._busy_accounts: set[str] = set()
        self._load_accounts()

    def _load_accounts(self) -> None:
        raw_accounts = read_json(ACCOUNTS_FILE, [])
        self.accounts = {}
        for raw_account in raw_accounts:
            account = AccountRecord(**raw_account)
            account.status = "stopped"
            self.accounts[account.id] = account

    def _save_accounts(self) -> None:
        write_json(ACCOUNTS_FILE, [asdict(account) for account in self.accounts.values()])

    def api_configured(self) -> bool:
        config = read_json(CONFIG_FILE, {})
        return bool(config.get("api_id") and config.get("api_hash"))

    def get_api_credentials(self) -> tuple[int, str]:
        config = read_json(CONFIG_FILE, {})
        api_id = config.get("api_id")
        api_hash = config.get("api_hash")
        if not api_id or not api_hash:
            raise ValueError("Telegram API ID and API hash are not configured.")
        return int(api_id), str(api_hash)

    def list_accounts(self) -> list[dict]:
        return [asdict(account) for account in sorted(self.accounts.values(), key=lambda item: item.label.lower())]

    async def start_login(self, phone: str, label: str | None = None) -> AccountRecord:
        async with self.lock:
            api_id, api_hash = self.get_api_credentials()
            normalized_phone = phone.strip()
            account = self._find_or_create_account(normalized_phone, label)
            client = self._new_client(account.session_name, api_id, api_hash)
            try:
                await self._connect_client(client)
                if await client.is_user_authorized():
                    await self._complete_login(account, client)
                else:
                    sent_code = await client.send_code_request(normalized_phone)
                    account.status = "login_pending"
                    account.last_error = None
                    self.pending_logins[account.id] = LoginState(
                        account_id=account.id,
                        client=client,
                        phone_code_hash=sent_code.phone_code_hash,
                    )
                self._save_accounts()
                return account
            except Exception as exc:
                await _disconnect(client)
                account.status = "error"
                account.last_error = self._login_error_message(exc)
                self._save_accounts()
                raise ValueError(account.last_error) from exc

    async def confirm_code(self, account_id: str, code: str) -> AccountRecord:
        async with self.lock:
            account = self._get_account(account_id)
            login_state = self.pending_logins.get(account_id)
            if not login_state:
                raise ValueError("No pending login exists for this account.")
            try:
                await login_state.client.sign_in(
                    phone=account.phone,
                    code=code.strip(),
                    phone_code_hash=login_state.phone_code_hash,
                )
            except SessionPasswordNeededError:
                account.status = "password_pending"
                self._save_accounts()
                return account
            except (PhoneCodeInvalidError, PhoneCodeExpiredError) as exc:
                account.status = "login_pending"
                account.last_error = str(exc)
                self._save_accounts()
                raise ValueError(str(exc)) from exc
            await self._complete_login(account, login_state.client)
            return account

    async def confirm_password(self, account_id: str, password: str) -> AccountRecord:
        async with self.lock:
            account = self._get_account(account_id)
            login_state = self.pending_logins.get(account_id)
            if not login_state:
                raise ValueError("No pending login exists for this account.")
            try:
                await login_state.client.sign_in(password=password)
            except PasswordHashInvalidError as exc:
                account.status = "password_pending"
                account.last_error = "Incorrect 2FA password. Try again."
                self._save_accounts()
                raise ValueError(account.last_error) from exc
            await self._complete_login(account, login_state.client)
            return account

    async def validate_account(self, account_id: str) -> AccountRecord:
        async with self.lock:
            account = self._get_account(account_id)
            api_id, api_hash = self.get_api_credentials()
            client = self._new_client(account.session_name, api_id, api_hash)
            try:
                await self._connect_client(client)
                authorized = await self._is_user_authorized(client)
                if not authorized:
                    account.authorized = False
                    account.status = "stopped"
                    account.last_error = "Session is not authorized. Log in again."
                    self._save_accounts()
                    return account
                await self._refresh_account_identity(account, client)
                account.authorized = True
                account.status = "stopped"
                account.last_error = None
                account.last_validated_at = now_iso()
                self._save_accounts()
                return account
            finally:
                await _disconnect(client)

    async def logout_account(self, account_id: str) -> AccountRecord:
        async with self.lock:
            account = self._get_account(account_id)
            client = self.clients.pop(account.id, None)
            if client is None:
                api_id, api_hash = self.get_api_credentials()
                client = self._new_client(account.session_name, api_id, api_hash)
                await client.connect()
            try:
                if await client.is_user_authorized():
                    await client.log_out()
            finally:
                await _disconnect(client)
            account.authorized = False
            account.status = "stopped"
            account.last_error = None
            self._save_accounts()
            return account

    async def warm_client(self, account_id: str) -> TelegramClient:
        """Connect and cache a client for the account for the duration of a run.

        Raises ValueError if the session is not authorized so the caller can skip it.
        The connection is kept open in self.clients until release_run_clients runs.
        """
        account = self._get_account(account_id)
        client = self.clients.get(account.id)
        if client is not None and client.is_connected():
            return client
        api_id, api_hash = self.get_api_credentials()
        client = self._new_client(account.session_name, api_id, api_hash)
        await self._connect_client(client)
        if not await self._is_user_authorized(client):
            await _disconnect(client)
            account.authorized = False
            account.last_error = "Session is not authorized. Log in again."
            self._save_accounts()
            raise ValueError(account.last_error)
        self.clients[account.id] = client
        return client

    async def run_warm_action(self, action: TelegramAction) -> TelegramActionResult:
        """Run one operation on a pre-warmed cached client.

        FloodWaitError is allowed to propagate so the queue can back off; all other
        exceptions are converted into a failed result for that single operation.
        """
        account = self._get_account(action.account_ids[0])
        try:
            client = await self.warm_client(account.id)
        except FloodWaitError:
            raise
        except Exception as exc:
            account.last_error = str(exc)
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, False, action.action_type, str(exc))
        try:
            detail = await run_telegram_action(client, action)
            account.authorized = True
            account.last_error = None
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, True, action.action_type, detail)
        except FloodWaitError:
            raise
        except Exception as exc:
            account.last_error = str(exc)
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, False, action.action_type, str(exc))

    async def release_run_clients(self, account_ids: list[str]) -> None:
        """Disconnect and drop cached clients warmed for a run."""
        for account_id in set(account_ids):
            client = self.clients.pop(account_id, None)
            if client is not None:
                await _disconnect(client)

    def _session_lock(self, account_id: str) -> asyncio.Lock:
        return self._session_locks.setdefault(account_id, asyncio.Lock())

    def is_account_busy(self, account_id: str) -> bool:
        """Non-blocking check of whether a run currently holds this account's session.

        The scheduler uses this to skip a fire whose accounts are in use instead of
        awaiting the lock (which would stall the serialized scheduler tick)."""
        return account_id in self._busy_accounts

    @asynccontextmanager
    async def session_guard(self, account_ids: list[str]) -> AsyncIterator[None]:
        """Hold the per-account session locks for the duration of a run so a `.session`
        file is used by at most one run at a time.

        Locks are acquired in sorted order so two runs sharing overlapping accounts
        (e.g. {A,B} and {B,A}) can never deadlock. Runs over disjoint accounts do not
        contend and still proceed in parallel.
        """
        ordered = sorted(set(account_ids))
        acquired: list[str] = []
        try:
            for account_id in ordered:
                await self._session_lock(account_id).acquire()
                acquired.append(account_id)
                self._busy_accounts.add(account_id)
            yield
        finally:
            for account_id in acquired:
                self._busy_accounts.discard(account_id)
                self._session_lock(account_id).release()

    @asynccontextmanager
    async def temp_client(self, account_id: str) -> AsyncIterator[TelegramClient]:
        """Yield a short-lived authorized client and disconnect it afterwards.

        Unlike warm_client this never touches the shared self.clients pool, so it
        is safe for one-off reads (e.g. inspecting scheduled messages) that must
        not interfere with an in-flight queue run on the same account.
        """
        account = self._get_account(account_id)
        api_id, api_hash = self.get_api_credentials()
        client = self._new_client(account.session_name, api_id, api_hash)
        await self._connect_client(client)
        try:
            if not await self._is_user_authorized(client):
                account.authorized = False
                account.last_error = "Session is not authorized. Log in again."
                self._save_accounts()
                raise ValueError(account.last_error)
            yield client
        finally:
            await _disconnect(client)

    async def shutdown(self) -> None:
        for client in list(self.clients.values()):
            await _disconnect(client)
        for login_state in list(self.pending_logins.values()):
            await _disconnect(login_state.client)
        self.clients.clear()
        self.pending_logins.clear()

    async def _complete_login(self, account: AccountRecord, client: TelegramClient) -> None:
        await self._refresh_account_identity(account, client)
        await _disconnect(client)
        account.authorized = True
        account.status = "stopped"
        account.last_error = None
        self.clients.pop(account.id, None)
        self.pending_logins.pop(account.id, None)
        self._save_accounts()

    async def _refresh_account_identity(self, account: AccountRecord, client: TelegramClient) -> None:
        me = await client.get_me()
        user: Any = me
        account.username = getattr(user, "username", None)
        account.first_name = getattr(user, "first_name", None)
        account.last_name = getattr(user, "last_name", None)
        if account.label == account.phone:
            account.label = (
                account.username
                or " ".join(part for part in [account.first_name, account.last_name] if part)
                or account.phone
            )

    def _find_or_create_account(self, phone: str, label: str | None) -> AccountRecord:
        for account in self.accounts.values():
            if account.phone == phone:
                if label:
                    account.label = label.strip()
                return account
        account_id = str(uuid.uuid4())
        account = AccountRecord(
            id=account_id,
            label=(label or phone).strip(),
            phone=phone,
            session_name=self._safe_session_name(phone, account_id),
        )
        self.accounts[account.id] = account
        return account

    def _get_account(self, account_id: str) -> AccountRecord:
        account = self.accounts.get(account_id)
        if not account:
            raise ValueError("Account was not found.")
        return account

    async def _connect_client(self, client: TelegramClient) -> None:
        try:
            await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            raise TimeoutError(
                "Telegram connection timed out. Check Windows date/time sync, timezone, and network."
            ) from exc

    async def _is_user_authorized(self, client: TelegramClient) -> bool:
        try:
            return await asyncio.wait_for(client.is_user_authorized(), timeout=CONNECT_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            raise TimeoutError(
                "Telegram authorization check timed out. Check Windows date/time sync, timezone, and network."
            ) from exc

    def _login_error_message(self, exc: Exception) -> str:
        if isinstance(exc, FloodWaitError):
            return f"Telegram is rate-limiting login attempts. Wait {exc.seconds} seconds, then try again."
        detail = str(exc).strip() or exc.__class__.__name__
        lower_detail = detail.lower()
        if "api_id" in lower_detail or "api hash" in lower_detail:
            return "Telegram API ID/API hash look invalid. Recheck Settings and save them again."
        if "phone" in lower_detail:
            return f"Telegram rejected the phone number: {detail}"
        if "timed out" in lower_detail or "timeout" in lower_detail:
            return detail
        return f"Telegram did not send a login code: {detail}"

    def _new_client(self, session_name: str, api_id: int, api_hash: str) -> TelegramClient:
        return TelegramClient(
            self._session_path(session_name),
            api_id,
            api_hash,
            timeout=10,
            request_retries=1,
            connection_retries=1,
            retry_delay=1,
            receive_updates=False,
            catch_up=False,
        )

    def _session_path(self, session_name: str) -> Path:
        return SESSIONS_DIR / session_name

    def _safe_session_name(self, phone: str, account_id: str) -> str:
        safe_phone = re.sub(r"[^0-9]+", "", phone)[-8:] or "account"
        return f"{safe_phone}-{account_id[:8]}"
