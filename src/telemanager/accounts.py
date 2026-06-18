from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from telethon import TelegramClient
from telethon.errors import FloodWaitError, PhoneCodeExpiredError, PhoneCodeInvalidError, SessionPasswordNeededError

from .config import ACCOUNTS_FILE, CONFIG_FILE, SESSIONS_DIR, read_json, write_json
from .telegram_actions import TelegramAction, TelegramActionResult, run_telegram_action, safe_delay

CONNECT_TIMEOUT_SECONDS = 25
RuntimeStatus = Literal["stopped", "running", "login_pending", "password_pending", "error"]


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
                client.disconnect()
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
            await login_state.client.sign_in(password=password)
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
                account.last_validated_at = self._now_iso()
                self._save_accounts()
                return account
            finally:
                client.disconnect()

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
                client.disconnect()
            account.authorized = False
            account.status = "stopped"
            account.last_error = None
            self._save_accounts()
            return account

    async def run_action(self, action: TelegramAction) -> list[TelegramActionResult]:
        if not action.confirm:
            raise ValueError("Action confirmation is required.")
        if not action.account_ids:
            raise ValueError("Select at least one account.")

        results: list[TelegramActionResult] = []
        for index, account_id in enumerate(action.account_ids):
            account = self._get_account(account_id)
            if index > 0:
                await safe_delay(action.delay_seconds)
            result = await self._run_action_for_account(account, action)
            results.append(result)
        return results

    async def _run_action_for_account(self, account: AccountRecord, action: TelegramAction) -> TelegramActionResult:
        api_id, api_hash = self.get_api_credentials()
        client = self.clients.get(account.id)
        owns_client = False
        if client is None or not client.is_connected():
            client = self._new_client(account.session_name, api_id, api_hash)
            try:
                await self._connect_client(client)
            except TimeoutError as exc:
                account.last_error = str(exc)
                self._save_accounts()
                return TelegramActionResult(account.id, account.label, False, action.action_type, str(exc))
            owns_client = True

        try:
            try:
                authorized = await self._is_user_authorized(client)
            except TimeoutError as exc:
                account.last_error = str(exc)
                self._save_accounts()
                return TelegramActionResult(account.id, account.label, False, action.action_type, str(exc))
            if not authorized:
                account.authorized = False
                account.last_error = "Session is not authorized. Log in again."
                self._save_accounts()
                return TelegramActionResult(account.id, account.label, False, action.action_type, account.last_error)

            detail = await run_telegram_action(client, action)
            account.authorized = True
            account.last_error = None
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, True, action.action_type, detail)
        except Exception as exc:
            account.last_error = str(exc)
            self._save_accounts()
            return TelegramActionResult(account.id, account.label, False, action.action_type, str(exc))
        finally:
            if owns_client:
                client.disconnect()

    async def shutdown(self) -> None:
        for client in list(self.clients.values()):
            client.disconnect()
        for login_state in list(self.pending_logins.values()):
            login_state.client.disconnect()
        self.clients.clear()
        self.pending_logins.clear()

    async def _complete_login(self, account: AccountRecord, client: TelegramClient) -> None:
        await self._refresh_account_identity(account, client)
        client.disconnect()
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

    def _now_iso(self) -> str:
        return datetime.now(UTC).isoformat()

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
