from __future__ import annotations

import asyncio

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
