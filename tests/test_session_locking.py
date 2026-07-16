from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from conftest import add_account


def _manager(app_context: dict):
    return app_context["main"].manager


def test_session_guard_serializes_same_account(app_context: dict) -> None:
    # Two runs over the same account must not overlap: the second guard waits until
    # the first exits. We record enter/exit order and assert no interleaving.
    manager = _manager(app_context)
    add_account(app_context, "acc-1", "Primary")
    events: list[str] = []

    async def run(tag: str) -> None:
        async with manager.session_guard(["acc-1"]):
            events.append(f"enter-{tag}")
            await asyncio.sleep(0.02)  # yield so a naive impl would interleave here
            events.append(f"exit-{tag}")

    async def go() -> None:
        await asyncio.gather(run("a"), run("b"))

    asyncio.run(go())

    # Whichever ran first, its enter/exit are adjacent — never enter-a, enter-b, ...
    assert events in (
        ["enter-a", "exit-a", "enter-b", "exit-b"],
        ["enter-b", "exit-b", "enter-a", "exit-a"],
    )


def test_session_guard_overlapping_accounts_do_not_deadlock(app_context: dict) -> None:
    # Guards for {A,B} and {B,A} acquire in sorted order, so they can't deadlock.
    manager = _manager(app_context)
    add_account(app_context, "acc-a", "A")
    add_account(app_context, "acc-b", "B")
    done: list[str] = []

    async def run(tag: str, ids: list[str]) -> None:
        async with manager.session_guard(ids):
            await asyncio.sleep(0.01)
            done.append(tag)

    async def go() -> None:
        await asyncio.wait_for(
            asyncio.gather(run("ab", ["acc-a", "acc-b"]), run("ba", ["acc-b", "acc-a"])),
            timeout=2.0,  # a deadlock would hang and trip this
        )

    asyncio.run(go())
    assert sorted(done) == ["ab", "ba"]


def test_session_guard_disjoint_accounts_run_in_parallel(app_context: dict) -> None:
    # Runs over different accounts must NOT serialize — both should be inside their
    # guards at the same time.
    manager = _manager(app_context)
    add_account(app_context, "acc-a", "A")
    add_account(app_context, "acc-b", "B")
    inside = 0
    max_inside = 0

    async def run(account_id: str) -> None:
        nonlocal inside, max_inside
        async with manager.session_guard([account_id]):
            inside += 1
            max_inside = max(max_inside, inside)
            await asyncio.sleep(0.02)
            inside -= 1

    async def go() -> None:
        await asyncio.gather(run("acc-a"), run("acc-b"))

    asyncio.run(go())
    assert max_inside == 2  # both were inside their guards concurrently


def test_is_account_busy_reflects_guard(app_context: dict) -> None:
    manager = _manager(app_context)
    add_account(app_context, "acc-1", "Primary")

    async def go() -> tuple[bool, bool, bool]:
        before = manager.is_account_busy("acc-1")
        async with manager.session_guard(["acc-1"]):
            during = manager.is_account_busy("acc-1")
        after = manager.is_account_busy("acc-1")
        return before, during, after

    before, during, after = asyncio.run(go())
    assert (before, during, after) == (False, True, False)


def test_try_begin_exclusive_acquires_and_releases(app_context: dict) -> None:
    manager = _manager(app_context)
    add_account(app_context, "acc-a", "A")
    add_account(app_context, "acc-b", "B")

    async def go() -> tuple[bool, bool, bool]:
        got = await manager.try_begin_exclusive(["acc-a", "acc-b"])
        during = manager.is_account_busy("acc-a") and manager.is_account_busy("acc-b")
        manager.end_exclusive(["acc-a", "acc-b"])
        after = manager.is_account_busy("acc-a") or manager.is_account_busy("acc-b")
        return got, during, after

    assert asyncio.run(go()) == (True, True, False)


def test_try_begin_exclusive_is_all_or_nothing(app_context: dict) -> None:
    # If any account in the set is busy, the whole acquire fails and nothing is
    # taken — the free account must stay free (no partial, leaked hold).
    manager = _manager(app_context)
    add_account(app_context, "acc-a", "A")
    add_account(app_context, "acc-b", "B")

    async def go() -> tuple[bool, bool]:
        async with manager.session_guard(["acc-b"]):
            got = await manager.try_begin_exclusive(["acc-a", "acc-b"])
            a_free = not manager.is_account_busy("acc-a")
        return got, a_free

    assert asyncio.run(go()) == (False, True)


def test_exclusive_session_fails_fast_when_run_holds_session(app_context: dict) -> None:
    # The core fix: while a run holds an account's session, an ad-hoc op must raise
    # AccountBusyError immediately instead of opening a second client on the file.
    from telemanager.accounts import AccountBusyError

    manager = _manager(app_context)
    add_account(app_context, "acc-1", "Primary")

    async def go() -> str:
        async with manager.session_guard(["acc-1"]):
            try:
                async with manager.exclusive_session("acc-1"):
                    return "acquired"
            except AccountBusyError:
                return "busy"

    assert asyncio.run(go()) == "busy"


def test_temp_client_refuses_busy_account(app_context: dict) -> None:
    # temp_client (dialog/message/scheduled reads) must not open a second client on
    # a `.session` a run is using. It fails fast before touching the client.
    from telemanager.accounts import AccountBusyError

    manager = _manager(app_context)
    add_account(app_context, "acc-1", "Primary")

    async def go() -> str:
        async with manager.session_guard(["acc-1"]):
            try:
                async with manager.temp_client("acc-1"):
                    return "opened"
            except AccountBusyError:
                return "busy"

    assert asyncio.run(go()) == "busy"


def test_delete_session_refused_while_account_busy(app_context: dict) -> None:
    # Deleting/renaming a `.session` file out from under a live run would fail on
    # Windows (file in use) or corrupt the open SQLite session.
    sessions_service = __import__("telemanager.sessions_service", fromlist=["sessions_service"])
    manager = _manager(app_context)
    add_account(app_context, "acc-1", "Primary")

    async def go() -> str:
        async with manager.session_guard(["acc-1"]):
            try:
                sessions_service.delete_local_session(manager, "acc-1")
                return "deleted"
            except ValueError as exc:
                return str(exc)

    result = asyncio.run(go())
    assert "busy" in result.lower()
    assert "acc-1" in manager.accounts  # not deleted


def test_reconcile_native_defers_when_account_busy(app_context: dict) -> None:
    # A native reconcile must not block the scheduler tick when its account is busy
    # with a run; it returns False so the tick retries on the next pass.
    ss = __import__("telemanager.schedules_service", fromlist=["schedules_service"])
    manager = _manager(app_context)
    add_account(app_context, "acc-1", "Primary")
    service = ss.SchedulerService(manager, {})
    schedule = ss.build_schedule(
        ss.ScheduleRequest(
            name="Native schedule",
            queue={
                "steps": [
                    {"action_type": "send_message", "account_ids": ["acc-1"], "targets": ["@chat"], "message": "hi"}
                ],
                "max_operations": 10,
            },
            recurrence={"interval_value": 5, "interval_unit": "minutes", "end_mode": "forever"},
        )
    )

    async def go() -> bool:
        async with manager.session_guard(["acc-1"]):
            return await service._reconcile_native(schedule, ss.utcnow())

    assert asyncio.run(go()) is False


# ---------------------------------------------------------------------------
# Fake Telethon client for login-flow tests
# ---------------------------------------------------------------------------


@dataclass
class _FakeCodeRequest:
    phone_code_hash: str = "fake_hash"


class FakeLoginClient:
    """Minimal TelegramClient stand-in for testing the login flow.

    ``authorized`` controls whether ``is_user_authorized`` returns True
    (auto-login) or False (sends code / needs password).  ``disconnect``
    records that it was called so tests can assert teardown happened.
    """

    def __init__(self, authorized: bool = False) -> None:
        self._authorized = authorized
        self._connected = False
        self.disconnected = False

    async def connect(self) -> None:
        self._connected = True

    def is_connected(self) -> bool:
        return self._connected and not self.disconnected

    async def is_user_authorized(self) -> bool:
        return self._authorized

    async def send_code_request(self, phone: str) -> _FakeCodeRequest:
        return _FakeCodeRequest()

    async def sign_in(
        self,
        phone: str | None = None,
        code: str | None = None,
        phone_code_hash: str | None = None,
    ) -> None:
        if code == "bad":
            from telethon.errors import PhoneCodeInvalidError

            raise PhoneCodeInvalidError(request=None)
        self._authorized = True

    async def get_me(self) -> Any:
        return type(
            "Me",
            (),
            {"username": "testuser", "first_name": "Test", "last_name": "User"},
        )()

    async def disconnect(self) -> None:
        self.disconnected = True


def _write_config(data_dir: Path) -> None:
    """Drop minimal API credentials so get_api_credentials() succeeds."""
    config_file = data_dir / "config.json"
    config_file.write_text(json.dumps({"api_id": 12345, "api_hash": "fake_hash"}), encoding="utf-8")


# ---------------------------------------------------------------------------
# Login-lock tests
# ---------------------------------------------------------------------------


def test_start_login_busy_account(app_context: dict) -> None:
    """start_login must raise AccountBusyError when a run holds the session."""
    from telemanager.accounts import AccountBusyError

    manager = _manager(app_context)
    account = add_account(app_context, "acc-1", "Primary")
    account.phone = "+10000000000"
    manager._save_accounts()
    _write_config(app_context["data_dir"])

    async def go() -> str:
        async with manager.session_guard(["acc-1"]):
            try:
                await manager.start_login("+10000000000")
                return "started"
            except AccountBusyError:
                return "busy"
            except ValueError:
                return "value_error"

    assert asyncio.run(go()) == "busy"


def test_start_login_disconnects_prior_pending(app_context: dict) -> None:
    """A second start_login for the same account must disconnect the first
    pending client and replace it with a fresh one."""
    manager = _manager(app_context)
    account = add_account(app_context, "acc-1", "Primary")
    account.phone = "+10000000000"
    manager._save_accounts()
    _write_config(app_context["data_dir"])

    fake_client_1 = FakeLoginClient(authorized=False)
    fake_client_2 = FakeLoginClient(authorized=False)
    clients = iter([fake_client_1, fake_client_2])

    original_new_client = manager._new_client

    def _patched_new_client(session_name: str, api_id: int, api_hash: str):  # type: ignore[no-untyped-def]
        return next(clients)

    manager._new_client = _patched_new_client  # type: ignore[assignment]

    async def go() -> tuple[bool, bool]:
        # First login → pending
        await manager.start_login("+10000000000")
        first_state = manager.pending_logins.get("acc-1")
        first_client = first_state.client if first_state else None

        # Second login → should disconnect first, create new pending
        await manager.start_login("+10000000000")
        second_state = manager.pending_logins.get("acc-1")
        second_client = second_state.client if second_state else None

        return first_client is not None and first_client.disconnected, second_client is fake_client_2

    first_disconnected, second_is_new = asyncio.run(go())
    assert first_disconnected, "First pending client should have been disconnected"
    assert second_is_new, "Second login should use a new client"
    manager._new_client = original_new_client  # type: ignore[assignment]
