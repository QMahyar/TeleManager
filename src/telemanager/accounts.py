from __future__ import annotations

import asyncio
import inspect
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)

from .config import SESSIONS_DIR, now_iso
from .documents import accounts_doc, config_doc
from .telegram_actions import TelegramAction, TelegramActionResult, run_telegram_action
from .telegram_errors import classify_telegram_error

CONNECT_TIMEOUT_SECONDS = 25
RuntimeStatus = Literal["stopped", "running", "login_pending", "password_pending", "error"]


class AccountBusyError(ValueError):
    """An ad-hoc session op (read/validate/logout) was attempted on an account a
    queue run or schedule is currently using.

    Subclasses ValueError so the existing endpoint handlers turn it into a clear
    400 instead of a 500. Opening a second Telethon client on the same `.session`
    SQLite file concurrently corrupts it, so these ops fail fast rather than race.
    """


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
    # Per-account override for downloading/showing dialog profile photos. "default"
    # defers to the global app setting; "on"/"off" force it for this account. New
    # field with a default so existing accounts.json records load unchanged.
    photos_mode: str = "default"

    def to_public_dict(self) -> dict[str, Any]:
        """Public dict for API responses. Includes computed health_status."""
        from .session_health import compute_health_status

        data = asdict(self)
        data["health_status"] = compute_health_status(
            self.authorized, self.last_validated_at, self.last_error
        )
        return data


@dataclass
class LoginState:
    account_id: str
    client: TelegramClient
    phone_code_hash: str


async def _disconnect(client: Any) -> None:
    """Disconnect a client, tolerating Telethon's ``disconnect()`` returning either an
    awaitable (when connected) or ``None`` (when already disconnected). ``await None``
    raises TypeError, so an already-closed client must not be awaited."""
    result = client.disconnect()
    if inspect.isawaitable(result):
        await result


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
        raw_accounts = accounts_doc.read([])
        self.accounts = {}
        for raw_account in raw_accounts:
            account = AccountRecord(**raw_account)
            account.status = "stopped"
            self.accounts[account.id] = account

    def _save_accounts(self) -> None:
        # Snapshot of the in-memory fleet (the source of truth, guarded by self.lock);
        # routed through accounts_doc so the write shares the unified store layer.
        accounts_doc.write([asdict(account) for account in self.accounts.values()])

    def api_configured(self) -> bool:
        config = config_doc.read({})
        return bool(config.get("api_id") and config.get("api_hash"))

    def get_api_credentials(self) -> tuple[int, str]:
        config = config_doc.read({})
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

            # If this account already has a pending login, disconnect the old client
            # and release its session lock so we can open a fresh one.
            old_login = self.pending_logins.pop(account.id, None)
            if old_login is not None:
                await _disconnect(old_login.client)
                self.end_exclusive([account.id])

            # Hold the exclusive session lock for the duration of the login flow
            # (released by _complete_login on success, or in the except block on
            # failure) so no other task can open a second Telethon client on the
            # same .session SQLite file.
            if not await self.try_begin_exclusive([account.id]):
                raise AccountBusyError(
                    "This account is busy with a running queue or schedule. "
                    "Wait for it to finish, then try again."
                )

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
                self.end_exclusive([account.id])
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
            async with self.exclusive_session(account.id):
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
            # exclusive_session refuses if a run holds the session, so a logout can
            # never disconnect/log out a client a live queue is mid-action on.
            async with self.exclusive_session(account.id):
                client = self.clients.pop(account.id, None)
                if client is None:
                    api_id, api_hash = self.get_api_credentials()
                    client = self._new_client(account.session_name, api_id, api_hash)
                    await self._connect_client(client)
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

        All exceptions are classified and converted to user-friendly messages.
        FloodWaitError propagates to allow queue-level retry logic.
        """
        account = self._get_account(action.account_ids[0])
        try:
            client = await self.warm_client(account.id)
        except FloodWaitError:
            raise
        except Exception as exc:
            error_info = classify_telegram_error(exc)
            account.last_error = error_info.user_message
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, False, action.action_type, error_info.user_message)
        try:
            detail = await run_telegram_action(client, action)
            account.authorized = True
            account.last_error = None
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, True, action.action_type, detail)
        except FloodWaitError:
            raise
        except Exception as exc:
            error_info = classify_telegram_error(exc)
            account.last_error = error_info.user_message
            # Mark session invalid if it's a session error
            if error_info.category == "session_invalid":
                account.authorized = False
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, False, action.action_type, error_info.user_message)

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

    async def try_begin_exclusive(self, account_ids: list[str]) -> bool:
        """Non-blocking, all-or-nothing acquire of the per-account session locks.

        Returns True (locks held, accounts marked busy) only if every account is
        currently free; otherwise acquires nothing and returns False so the caller
        can fail fast or defer instead of stalling behind a long-running queue.

        Correct on a single event loop: we first confirm none are held, so each
        ``await lock.acquire()`` on an unheld, waiter-free lock completes without
        suspending — no other task runs between the check and the acquisitions.
        """
        ordered = sorted(set(account_ids))
        if any(aid in self._busy_accounts or self._session_lock(aid).locked() for aid in ordered):
            return False
        for account_id in ordered:
            await self._session_lock(account_id).acquire()
            self._busy_accounts.add(account_id)
        return True

    def end_exclusive(self, account_ids: list[str]) -> None:
        """Release locks taken by :meth:`try_begin_exclusive`."""
        for account_id in sorted(set(account_ids)):
            if account_id in self._busy_accounts:
                self._busy_accounts.discard(account_id)
                self._session_lock(account_id).release()

    @asynccontextmanager
    async def exclusive_session(self, account_id: str) -> AsyncIterator[None]:
        """Hold one account's session lock for a short ad-hoc op, failing fast with
        :class:`AccountBusyError` if a run (or another ad-hoc op) already uses it.

        Unlike :meth:`session_guard` (which a run holds for its whole lifetime and
        which *waits* its turn), ad-hoc reads must never stall behind a long queue —
        surfacing "busy" immediately is the honest, non-blocking behaviour.
        """
        if not await self.try_begin_exclusive([account_id]):
            raise AccountBusyError(
                "This account is busy with a running queue or schedule. "
                "Wait for it to finish, then try again."
            )
        try:
            yield
        finally:
            self.end_exclusive([account_id])

    @asynccontextmanager
    async def temp_client(self, account_id: str) -> AsyncIterator[TelegramClient]:
        """Yield a short-lived authorized client and disconnect it afterwards.

        Unlike warm_client this never touches the shared self.clients pool. It holds
        the account's session lock (via exclusive_session) for the read so it can
        never open a second client on a `.session` file an in-flight run is using —
        which would corrupt the SQLite session. Raises AccountBusyError if a run
        currently holds that session.
        """
        account = self._get_account(account_id)
        async with self.exclusive_session(account.id):
            api_id, api_hash = self.get_api_credentials()
            client = self._new_client(account.session_name, api_id, api_hash)
            # connect inside the try so a connect/auth timeout still disconnects the
            # client. Otherwise Telethon's send/recv loop tasks, spawned during
            # connect(), leak as pending tasks ("coroutine ignored GeneratorExit").
            try:
                await self._connect_client(client)
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
        self.end_exclusive([account.id])

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
