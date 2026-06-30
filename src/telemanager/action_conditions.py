"""Run-time evaluation of step conditions (the #12 "smart queue" guard).

A `StepCondition` is `{field, op, value}`. Before a conditional operation runs,
the worker calls `evaluate_condition` with the account's warm client; if it
returns `(False, reason)` the operation is skipped (not run) and the reason is
recorded. Metric lookups reuse the existing target-resolution helpers, so this
module only adds the comparison + the skip-on-uncertainty policy.

ponytail: skip-on-uncertainty. A failed/None lookup returns False — a guarded app
must never act on state it couldn't verify. Upgrade path if that's ever too
conservative: a per-field "default when unknown" policy.
"""
from __future__ import annotations

import operator
from collections.abc import Callable
from typing import Any

from .telegram_actions import resolve_full_entity, resolve_input_peer
from .telegram_errors import classify_telegram_error
from .timeutil import utcnow

# The six comparison operators, keyed by the symbol stored on the condition. This
# is the whole "DSL" — a lookup table, not a parser.
_OPS: dict[str, Callable[[float, float], bool]] = {
    "<": operator.lt,
    "<=": operator.le,
    "==": operator.eq,
    "!=": operator.ne,
    ">": operator.gt,
    ">=": operator.ge,
}


def compare(metric: float, op: str, value: float) -> bool:
    """Apply one operator. Raises ValueError on an unknown symbol (shouldn't happen:
    the symbol is constrained by the StepCondition Literal at the API boundary)."""
    fn = _OPS.get(op)
    if fn is None:
        raise ValueError(f"Unknown condition operator: {op!r}")
    return fn(metric, value)


async def _member_count(client: Any, target: str) -> float | None:
    entity = await resolve_full_entity(client, target)
    count = getattr(entity, "participants_count", None)
    return None if count is None else float(count)


async def _days_since_last_message(client: Any, target: str) -> float | None:
    peer = await resolve_input_peer(client, target)
    messages = await client.get_messages(peer, limit=1)
    if not messages:
        return None
    when = getattr(messages[0], "date", None)
    if when is None:
        return None
    return float((utcnow() - when).days)


def match_unread(payload: dict, target: str) -> float | None:
    """Unread count for `target` from a cached-dialogs payload, or None on a miss.

    Matches a bare/@username (case-insensitive) or the stored id string. ponytail:
    cached read — stale if dialogs weren't re-fetched recently; that staleness is
    the known ceiling, upgrade path is a live single-dialog lookup if it matters.
    """
    needle = target.strip().lstrip("@").lower()
    for dialog in payload.get("dialogs", []) or []:
        if not isinstance(dialog, dict):
            continue
        username = str(dialog.get("username") or "").lower()
        ident = str(dialog.get("id", "")).lower()
        if needle and needle in {username, ident}:
            return float(dialog.get("unread_count", 0) or 0)
    return None


async def metric_value(
    manager: Any, client: Any, account_id: str, target: str, field: str
) -> float | None:
    if field == "member_count":
        return await _member_count(client, target)
    if field == "days_since_last_message":
        return await _days_since_last_message(client, target)
    if field == "unread_count":
        # Local import avoids a module-load cycle (dialogs_service imports accounts).
        from .dialogs_service import list_cached_dialogs

        return match_unread(list_cached_dialogs(manager, account_id), target)
    return None


def _fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


async def evaluate_condition(
    manager: Any, client: Any, account_id: str, target: str, condition: dict
) -> tuple[bool, str]:
    """Return (should_run, reason). Skip-on-uncertainty: a failed lookup or a
    missing metric returns (False, ...) — the operation is skipped, never run blind."""
    field = condition.get("field")
    op = condition.get("op")
    value = float(condition.get("value", 0))
    try:
        metric = await metric_value(manager, client, account_id, target, field)
    except Exception as exc:  # resolution / Telegram error — degrade to skip
        detail = classify_telegram_error(exc).user_message
        return False, f"Skipped: could not read {field} ({detail})."
    if metric is None:
        return False, f"Skipped: {field} unavailable for this target."
    spec = f"{field} {op} {_fmt(value)}"
    if compare(metric, op, value):
        return True, f"Condition met ({spec}; actual {field}={_fmt(metric)})."
    return False, f"Skipped: condition not met ({spec}; actual {field}={_fmt(metric)})."
