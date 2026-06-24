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
