from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .accounts import AccountManager
from .action_queue_service import ActionQueueRequest, start_action_queue
from .audit_service import log_event
from .documents import schedules_doc
from .telegram_actions import (
    NATIVELY_SCHEDULABLE_ACTIONS,
    TELEGRAM_SCHEDULED_PER_CHAT_LIMIT,
    create_scheduled_media,
    create_scheduled_text,
    delete_scheduled_messages,
    fetch_scheduled_messages,
    list_scheduled_message_times,
    parse_options,
    safe_delay,
)

logger = logging.getLogger("telemanager.scheduler")

# Action types Telegram can pre-deliver server-side as a scheduled message, so a
# schedule made only of these can fire while TeleManager is closed — sourced from
# the unified ACTION_META registry (send_message/send_media unconditionally, and
# start_bot only without a referral param, handled in _step_is_native).
# Telegram only schedules messages 365 days out; keep a small safety margin.
NATIVE_HORIZON = timedelta(days=364)
# How often a running app refills the per-chat native buffer. With a 100-message
# buffer this comfortably covers any interval down to the 1-minute minimum.
NATIVE_RECONCILE_INTERVAL = timedelta(hours=1)
# When a reconcile is deferred because an account is mid-run (its session is in
# use), retry this soon instead of waiting a full interval. The 100-message buffer
# means a short deferral never starves delivery.
NATIVE_RECONCILE_DEFER = timedelta(seconds=60)
# Re-evaluate the schedule set at least this often even when nothing is due.
MAX_SLEEP_SECONDS = 3600.0
MIN_SLEEP_SECONDS = 1.0
MAX_TRACKED_RUN_IDS = 50
# Small pause between creating native scheduled messages so a large initial buffer
# (e.g. 60 sends across chats) does not hammer Telegram in a tight loop. Telethon
# also auto-sleeps on flood waits; this just keeps the steady state gentle.
NATIVE_SEND_DELAY = 0.2

TERMINAL_SCHEDULE_STATUSES = {"completed", "canceled"}
ACTIVE_SCHEDULE_STATUSES = {"active", "paused", "error"}

UNIT_SECONDS = {"minutes": 60, "hours": 3600, "days": 86400}


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class RecurrenceConfig(BaseModel):
    interval_value: int = Field(ge=1, le=100000)
    interval_unit: Literal["minutes", "hours", "days"]
    start_at: str | None = None
    end_mode: Literal["count", "until", "forever"] = "forever"
    end_count: int | None = Field(default=None, ge=1, le=1000000)
    end_until: str | None = None
    # Offset each successive chat's sends by this many seconds so identical
    # messages to several chats do not all fire at the same instant.
    stagger_seconds: int = Field(default=0, ge=0, le=3600)

    @model_validator(mode="after")
    def validate_recurrence(self) -> RecurrenceConfig:
        if self.end_mode == "count" and not self.end_count:
            raise ValueError("A repeat count is required when ending after a number of times.")
        if self.end_mode == "until":
            until = parse_iso(self.end_until)
            if not until:
                raise ValueError("A valid end date/time is required when ending on a date.")
            self.end_until = iso(until)
        if self.start_at is not None:
            start = parse_iso(self.start_at)
            if not start:
                raise ValueError("Start time must be a valid date/time.")
            self.start_at = iso(start)
        return self


class ScheduleRequest(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    queue: ActionQueueRequest
    recurrence: RecurrenceConfig

    @model_validator(mode="after")
    def validate_request(self) -> ScheduleRequest:
        self.name = self.name.strip()
        return self


class ScheduleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=80)
    status: Literal["active", "paused"] | None = None


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def load_schedules() -> dict[str, dict[str, Any]]:
    raw = schedules_doc.read({})
    if not isinstance(raw, dict):
        return {}
    return {str(key): value for key, value in raw.items() if isinstance(value, dict)}


def save_schedules(schedules: dict[str, dict[str, Any]]) -> None:
    # Callers (scheduler create/update/delete, schedule routes) perform the
    # read -> modify -> save under the scheduler's asyncio lock, so this stays a
    # plain write; schedules_doc keeps it on the unified store layer.
    schedules_doc.write(schedules)


def list_schedules(schedules: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(schedules.values(), key=lambda item: item.get("created_at", ""), reverse=True)


def scheduled_targets_by_account() -> dict[str, set[str]]:
    """Map every account to the set of chats it has scheduled work for.

    Unions two sources from schedules.json: each queue step's account_ids x targets
    (covers in-app `schedule_message` runs and any runner schedule), and the
    native_chats buffer keys (covers Telegram-delivered text schedules). Only active
    or paused schedules are considered — completed/canceled ones no longer hold
    anything on Telegram's side. Returns only accounts that have at least one chat.
    """
    mapping: dict[str, set[str]] = {}
    for schedule in load_schedules().values():
        if schedule.get("status") in TERMINAL_SCHEDULE_STATUSES:
            continue
        for step in schedule.get("queue", {}).get("steps", []) or []:
            targets = [t for t in (step.get("targets") or []) if t]
            for account_id in step.get("account_ids") or []:
                if targets:
                    mapping.setdefault(account_id, set()).update(targets)
        for key, entry in (schedule.get("native_chats") or {}).items():
            account_id = key.split("|", 1)[0]
            target = entry.get("target")
            if account_id and target:
                mapping.setdefault(account_id, set()).add(target)
    return mapping


def _matching_native_entries(account_id: str, target: str) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Yield (schedule, chat-entry) pairs whose native buffer targets this account+chat."""
    matches: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for schedule in load_schedules().values():
        for key, entry in (schedule.get("native_chats") or {}).items():
            if key.startswith(f"{account_id}|") and entry.get("target") == target:
                matches.append((schedule, entry))
    return matches


def owned_native_ids(account_id: str, target: str) -> set[int]:
    """Scheduled-message ids that a local schedule created for this account+chat."""
    owned: set[int] = set()
    for _schedule, entry in _matching_native_entries(account_id, target):
        owned.update(int(mid) for mid in (entry.get("ids") or {}))
    return owned


def prune_local_native_ids(account_id: str, target: str, ids: list[int]) -> None:
    """Forget cleared scheduled-message ids so the buffer can refill them if active."""
    removed = {int(message_id) for message_id in ids}
    schedules = load_schedules()
    changed = False
    for schedule in schedules.values():
        for key, entry in (schedule.get("native_chats") or {}).items():
            if not key.startswith(f"{account_id}|") or entry.get("target") != target:
                continue
            kept = {mid: when for mid, when in (entry.get("ids") or {}).items() if int(mid) not in removed}
            if len(kept) != len(entry.get("ids") or {}):
                entry["ids"] = kept
                changed = True
    if changed:
        save_schedules(schedules)


# ---------------------------------------------------------------------------
# Recurrence math (pure, unit-tested)
# ---------------------------------------------------------------------------


def interval_delta(recurrence: dict[str, Any]) -> timedelta:
    seconds = UNIT_SECONDS[recurrence["interval_unit"]] * int(recurrence["interval_value"])
    return timedelta(seconds=seconds)


def total_planned(recurrence: dict[str, Any]) -> int | None:
    return int(recurrence["end_count"]) if recurrence.get("end_mode") == "count" else None


def compute_anchor(recurrence: dict[str, Any], created_at: datetime) -> datetime:
    start = parse_iso(recurrence.get("start_at"))
    if start:
        return start
    return created_at + interval_delta(recurrence)


def upcoming_fire_times(
    anchor: datetime,
    recurrence: dict[str, Any],
    after: datetime,
    horizon: datetime,
    limit: int,
) -> list[datetime]:
    """Fire times strictly after `after`, up to and including `horizon`, honoring
    the end condition (count/until), capped at `limit` items."""
    delta = interval_delta(recurrence)
    if delta.total_seconds() <= 0 or limit <= 0:
        return []
    delta_seconds = delta.total_seconds()
    diff = (after - anchor).total_seconds()
    k = 0 if diff < 0 else int(diff // delta_seconds) + 1
    count = total_planned(recurrence)
    until = parse_iso(recurrence.get("end_until"))
    times: list[datetime] = []
    while len(times) < limit:
        if count is not None and k >= count:
            break
        fire = anchor + k * delta
        if fire > horizon:
            break
        if until and fire > until:
            break
        if fire > after:
            times.append(fire)
        k += 1
    return times


def next_future_slot(anchor: datetime, recurrence: dict[str, Any], after: datetime) -> datetime | None:
    horizon = after + NATIVE_HORIZON + timedelta(days=2)
    times = upcoming_fire_times(anchor, recurrence, after, horizon, limit=1)
    return times[0] if times else None


def fires_elapsed(anchor: datetime, recurrence: dict[str, Any], instant: datetime) -> int:
    """How many fire slots have already passed at `instant` (bounded by the plan)."""
    delta = interval_delta(recurrence)
    until = parse_iso(recurrence.get("end_until"))
    effective = min(instant, until) if until else instant
    if effective < anchor:
        return 0
    elapsed = int((effective - anchor).total_seconds() // delta.total_seconds()) + 1
    count = total_planned(recurrence)
    return min(elapsed, count) if count is not None else elapsed


def native_horizon(recurrence: dict[str, Any], now: datetime) -> datetime:
    horizon = now + NATIVE_HORIZON
    until = parse_iso(recurrence.get("end_until"))
    return min(horizon, until) if until else horizon


# ---------------------------------------------------------------------------
# Engine classification
# ---------------------------------------------------------------------------


def _step_is_native(step: dict[str, Any]) -> bool:
    action = step.get("action_type")
    # A plain "/start" (no referral parameter) is just a text message and can be
    # pre-scheduled; a referral start goes through StartBotRequest and cannot.
    if action == "start_bot":
        return not (step.get("message") or "").strip()
    return action in NATIVELY_SCHEDULABLE_ACTIONS


def classify_engine(steps: list[dict[str, Any]]) -> tuple[str, str]:
    if all(_step_is_native(step) for step in steps):
        return "native", "Text-only schedule. Telegram delivers these even while TeleManager is closed."
    offline_blockers = sorted({step.get("action_type", "?") for step in steps if not _step_is_native(step)})
    pretty = ", ".join(action.replace("_", " ") for action in offline_blockers)
    return "runner", f"Contains actions Telegram cannot pre-schedule ({pretty}); runs only while TeleManager is open."


def native_payload_for_step(step: dict[str, Any]) -> dict[str, Any] | None:
    """Describe what to pre-schedule for a native step, or None if it has nothing.

    Returns {"kind": "text", "text": ...} or {"kind": "media", "file", "caption",
    "parse_mode"} so the reconcile loop can dispatch to the right native creator.
    """
    action = step.get("action_type")
    if action == "start_bot":
        return {"kind": "text", "text": "/start"}
    if action == "send_media":
        options = parse_options(step.get("message"))
        file = (options.get("file") or options.get("path") or "").strip()
        if not file:
            return None
        return {
            "kind": "media",
            "file": file,
            "caption": options.get("caption") or options.get("message") or "",
            "parse_mode": options.get("parse_mode"),
        }
    text = (step.get("message") or "").strip()
    return {"kind": "text", "text": text} if text else None


async def _create_native(client: Any, target: str, payload: dict[str, Any], when: datetime) -> int:
    """Create one native scheduled message for `payload` and return its id."""
    if payload["kind"] == "media":
        return await create_scheduled_media(
            client, target, payload["file"], payload.get("caption") or "", payload.get("parse_mode"), when
        )
    return await create_scheduled_text(client, target, payload["text"], when)


# ---------------------------------------------------------------------------
# Schedule lifecycle
# ---------------------------------------------------------------------------


def build_schedule(request: ScheduleRequest) -> dict[str, Any]:
    now = utcnow()
    queue = request.queue.model_dump()
    recurrence = request.recurrence.model_dump()
    engine, reason = classify_engine(queue["steps"])
    anchor = compute_anchor(recurrence, now)
    next_fire = next_future_slot(anchor, recurrence, now)
    return {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "status": "active",
        "engine": engine,
        "engine_reason": reason,
        "queue": queue,
        "recurrence": recurrence,
        "created_at": iso(now),
        "updated_at": iso(now),
        "anchor_at": iso(anchor),
        "next_fire_at": iso(next_fire) if next_fire else None,
        "fires_done": 0,
        "fires_planned": total_planned(recurrence),
        "last_fire_at": None,
        "last_reconcile_at": None,
        "coverage_until": None,
        "run_ids": [],
        "native_chats": {},
        "last_error": None,
    }


def schedule_preview(request: ScheduleRequest) -> dict[str, Any]:
    now = utcnow()
    queue = request.queue.model_dump()
    recurrence = request.recurrence.model_dump()
    engine, reason = classify_engine(queue["steps"])
    anchor = compute_anchor(recurrence, now)
    upcoming = upcoming_fire_times(anchor, recurrence, now, now + NATIVE_HORIZON, limit=5)
    targets_per_fire = sum(len(step["account_ids"]) * len(step["targets"]) for step in queue["steps"])
    warnings = preview_warnings(engine, recurrence, queue, now)
    coverage = None
    planned = total_planned(recurrence)
    # "Fully offline" means every send fits inside Telegram's per-chat buffer, so
    # all of them are pre-scheduled at once and no reopen is ever required.
    fully_offline = engine == "native" and planned is not None and planned <= TELEGRAM_SCHEDULED_PER_CHAT_LIMIT
    if engine == "native":
        horizon = native_horizon(recurrence, now)
        window = upcoming_fire_times(anchor, recurrence, now, horizon, TELEGRAM_SCHEDULED_PER_CHAT_LIMIT)
        coverage = iso(window[-1]) if window else None
    return {
        "engine": engine,
        "engine_reason": reason,
        "fires_planned": planned,
        "operations_per_fire": targets_per_fire,
        "total_messages": planned * targets_per_fire if planned is not None else None,
        "fully_offline": fully_offline,
        "next_fire_at": iso(upcoming[0]) if upcoming else None,
        "upcoming": [iso(fire) for fire in upcoming],
        "coverage_until": coverage,
        "warnings": warnings,
    }


def preview_warnings(engine: str, recurrence: dict[str, Any], queue: dict[str, Any], now: datetime) -> list[str]:
    warnings: list[str] = []
    if engine == "runner":
        warnings.append("This schedule only fires while TeleManager is running. Keep the app open for it to run.")
    else:
        planned = total_planned(recurrence)
        if planned is None or planned > TELEGRAM_SCHEDULED_PER_CHAT_LIMIT:
            warnings.append(
                f"Telegram pre-schedules at most {TELEGRAM_SCHEDULED_PER_CHAT_LIMIT} messages per chat. "
                "Reopen TeleManager periodically so the buffer keeps refilling for long-running schedules."
            )
    seconds = interval_delta(recurrence).total_seconds()
    if seconds < 300:
        warnings.append(
            "Short intervals can trip Telegram flood limits. Use the largest interval that still works for you."
        )
    return warnings


def _trim_runs(schedule: dict[str, Any]) -> None:
    if len(schedule.get("run_ids", [])) > MAX_TRACKED_RUN_IDS:
        schedule["run_ids"] = schedule["run_ids"][-MAX_TRACKED_RUN_IDS:]


# ---------------------------------------------------------------------------
# Scheduler service
# ---------------------------------------------------------------------------


class SchedulerService:
    """Single background task that fires recurring schedules.

    Runner schedules spawn one queue run per fire (reusing the action queue
    runner); native schedules keep a rolling buffer of Telegram-native scheduled
    messages so they deliver even while the app is closed.
    """

    def __init__(self, manager: AccountManager, queue_runs: dict[str, dict]) -> None:
        self.manager = manager
        self.queue_runs = queue_runs
        self._task: asyncio.Task | None = None
        self._wake = asyncio.Event()
        self._stopped = False
        self._lock = asyncio.Lock()

    def notify(self) -> None:
        """Wake the loop early after a schedule was created/edited/removed."""
        self._wake.set()

    # -- endpoint-facing operations (serialized with the tick via the lock) ----

    def list_all(self) -> list[dict[str, Any]]:
        return list_schedules(load_schedules())

    def get(self, schedule_id: str) -> dict[str, Any] | None:
        return load_schedules().get(schedule_id)

    async def create(self, request: ScheduleRequest) -> dict[str, Any]:
        schedule = build_schedule(request)
        async with self._lock:
            schedules = load_schedules()
            schedules[schedule["id"]] = schedule
            save_schedules(schedules)
        log_event(
            "schedule_created",
            "Schedule created",
            schedule["name"],
            {"schedule_id": schedule["id"], "engine": schedule["engine"]},
        )
        self.notify()
        return schedule

    async def update(self, schedule_id: str, update: ScheduleUpdateRequest) -> dict[str, Any]:
        async with self._lock:
            schedules = load_schedules()
            schedule = schedules.get(schedule_id)
            if not schedule:
                raise KeyError(schedule_id)
            if update.status and schedule["status"] in TERMINAL_SCHEDULE_STATUSES:
                raise ValueError("Completed or canceled schedules cannot be reactivated.")
            if update.name:
                schedule["name"] = update.name.strip()
            if update.status:
                schedule["status"] = update.status
                if update.status == "active":
                    schedule["last_error"] = None
                    self._advance_past_now(schedule, utcnow())
            schedule["updated_at"] = iso(utcnow())
            save_schedules(schedules)
        self.notify()
        return schedule

    async def delete(self, schedule_id: str) -> None:
        async with self._lock:
            schedules = load_schedules()
            schedule = schedules.get(schedule_id)
            if not schedule:
                raise KeyError(schedule_id)
            schedules.pop(schedule_id, None)
            save_schedules(schedules)
        # Delete any Telegram-native scheduled messages this schedule pre-created —
        # outside self._lock so a long run on a shared account can't freeze every
        # schedule endpoint, and best-effort so a connection failure (the schedule is
        # already gone) never fails the request. teardown_native serializes with runs
        # via session_guard so it never yanks a session from a live queue.
        try:
            await self.teardown_native(schedule)
        except Exception:  # noqa: BLE001 - schedule is already removed; cleanup is best-effort
            logger.exception("Native teardown failed for deleted schedule %s", schedule_id)
        log_event(
            "schedule_deleted",
            "Schedule deleted",
            schedule.get("name", schedule_id),
            {"schedule_id": schedule_id},
        )
        self.notify()

    async def run_now(self, schedule_id: str) -> dict[str, Any]:
        async with self._lock:
            schedules = load_schedules()
            schedule = schedules.get(schedule_id)
            if not schedule:
                raise KeyError(schedule_id)
            before = len(schedule.get("run_ids", []))
            self._fire_runner(schedule, utcnow())
            save_schedules(schedules)
            if len(schedule.get("run_ids", [])) == before:
                raise ValueError(schedule.get("last_error") or "Could not start an immediate run.")
        self.notify()
        return schedule

    async def inspect_scheduled(self, account_id: str, target: str) -> dict[str, Any]:
        """List the Telegram-native scheduled messages currently sitting in a chat."""
        clean_target = (target or "").strip()
        if not clean_target:
            raise ValueError("A chat target is required.")
        async with self.manager.temp_client(account_id) as client:
            rows = await fetch_scheduled_messages(client, clean_target)
        owned = owned_native_ids(account_id, clean_target)
        for row in rows:
            row["owned"] = row["id"] in owned
        return {"account_id": account_id, "target": clean_target, "messages": rows, "count": len(rows)}

    async def scheduled_overview(self) -> dict[str, Any]:
        """Auto-discover what every account has scheduled, no manual entry required.

        Telegram has no "list all scheduled messages" API — they live per chat. But
        every chat TeleManager ever scheduled to is recorded in schedules.json, so we
        derive an account -> chats map from there and fetch the live per-chat state for
        each. A per-account connection failure is captured on that account and the scan
        continues, so one offline session never blanks the whole view.
        """
        targets_by_account = scheduled_targets_by_account()
        accounts: list[dict[str, Any]] = []
        for account_id, targets in targets_by_account.items():
            record = self.manager.accounts.get(account_id)
            label = record.label if record else account_id
            entry: dict[str, Any] = {"account_id": account_id, "label": label, "chats": []}
            try:
                entry["chats"] = await self._overview_for_account(account_id, sorted(targets))
            except Exception as exc:  # noqa: BLE001 - report and keep scanning others
                entry["error"] = str(exc)
            accounts.append(entry)
        accounts.sort(key=lambda item: str(item.get("label", "")).lower())
        return {"generated_at": iso(utcnow()), "accounts": accounts}

    async def _overview_for_account(self, account_id: str, targets: list[str]) -> list[dict[str, Any]]:
        """Fetch the live scheduled messages for one account across its known chats."""
        chats: list[dict[str, Any]] = []
        async with self.manager.temp_client(account_id) as client:
            for target in targets:
                rows = await fetch_scheduled_messages(client, target)
                if not rows:
                    continue
                owned = owned_native_ids(account_id, target)
                for row in rows:
                    row["owned"] = row["id"] in owned
                chats.append(
                    {
                        "target": target,
                        "count": len(rows),
                        "owned_count": sum(1 for row in rows if row["owned"]),
                        "messages": rows,
                    }
                )
        chats.sort(key=lambda item: item["target"].lower())
        return chats

    async def clear_scheduled(self, account_id: str, target: str, ids: list[int] | None) -> dict[str, Any]:
        """Delete scheduled messages from a chat (all of them when ids is None)."""
        clean_target = (target or "").strip()
        if not clean_target:
            raise ValueError("A chat target is required.")
        async with self.manager.temp_client(account_id) as client:
            if ids is None:
                rows = await fetch_scheduled_messages(client, clean_target)
                ids = [int(row["id"]) for row in rows]
            await delete_scheduled_messages(client, clean_target, ids)
        async with self._lock:
            prune_local_native_ids(account_id, clean_target, ids)
        self.notify()
        return {"account_id": account_id, "target": clean_target, "cleared": len(ids)}

    def _advance_past_now(self, schedule: dict[str, Any], now: datetime) -> None:
        """Move next_fire_at to the next future slot so a resumed schedule does not
        replay a backlog accumulated while it was paused."""
        if schedule.get("engine") == "native":
            return
        next_fire = parse_iso(schedule.get("next_fire_at"))
        if next_fire is None:
            return
        delta = interval_delta(schedule["recurrence"])
        while next_fire <= now:
            next_fire += delta
        until = parse_iso(schedule["recurrence"].get("end_until"))
        if until and next_fire > until:
            self._complete(schedule)
        else:
            schedule["next_fire_at"] = iso(next_fire)

    async def start(self) -> None:
        if self._task is None:
            self._stopped = False
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopped = True
        self._wake.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001 - best-effort shutdown
                pass
            self._task = None

    async def _run(self) -> None:
        while not self._stopped:
            try:
                next_wake = await self.tick()
            except Exception:  # noqa: BLE001 - the loop must survive any single tick failure
                logger.exception("Scheduler tick failed")
                next_wake = utcnow() + timedelta(seconds=60)
            timeout = max(MIN_SLEEP_SECONDS, min(MAX_SLEEP_SECONDS, (next_wake - utcnow()).total_seconds()))
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=timeout)
            except TimeoutError:
                pass
            finally:
                self._wake.clear()

    async def tick(self) -> datetime:
        async with self._lock:
            return await self._tick_locked()

    async def _tick_locked(self) -> datetime:
        now = utcnow()
        schedules = load_schedules()
        soonest = now + timedelta(seconds=MAX_SLEEP_SECONDS)
        dirty = False
        for schedule in schedules.values():
            if schedule.get("status") != "active":
                continue
            try:
                if schedule.get("engine") == "native":
                    wake = await self._tick_native(schedule, now)
                else:
                    wake = await self._tick_runner(schedule, now)
                schedule["last_error"] = schedule.get("last_error")
            except Exception as exc:  # noqa: BLE001 - isolate one schedule's failure
                logger.exception("Schedule %s failed", schedule.get("id"))
                schedule["status"] = "error"
                schedule["last_error"] = str(exc)
                wake = now + timedelta(minutes=5)
            dirty = True
            if wake and wake < soonest:
                soonest = wake
        if dirty:
            save_schedules(schedules)
        return soonest

    async def _tick_runner(self, schedule: dict[str, Any], now: datetime) -> datetime | None:
        next_fire = parse_iso(schedule.get("next_fire_at"))
        if next_fire is None:
            self._complete(schedule)
            return None
        if now < next_fire:
            return next_fire

        self._fire_runner(schedule, now)
        schedule["fires_done"] = int(schedule.get("fires_done", 0)) + 1
        schedule["last_fire_at"] = iso(now)

        recurrence = schedule["recurrence"]
        nxt = next_fire + interval_delta(recurrence)
        while nxt <= now:  # skip slots missed while the app was closed
            nxt += interval_delta(recurrence)
        if self._runner_complete(schedule, nxt):
            self._complete(schedule)
            return None
        schedule["next_fire_at"] = iso(nxt)
        schedule["updated_at"] = iso(now)
        return nxt

    def _runner_complete(self, schedule: dict[str, Any], next_fire: datetime) -> bool:
        recurrence = schedule["recurrence"]
        planned = total_planned(recurrence)
        if planned is not None:
            return int(schedule.get("fires_done", 0)) >= planned
        until = parse_iso(recurrence.get("end_until"))
        if until:
            return next_fire > until
        return False

    def _fire_runner(self, schedule: dict[str, Any], now: datetime) -> None:
        queue = schedule["queue"]
        # Skip-and-record when an account this fire needs is already in use by another
        # run. _tick_runner still advances next_fire_at, so the fire is skipped (not
        # stacked) and the next slot is tried — never locking the shared `.session`.
        fire_account_ids = {account_id for step in queue["steps"] for account_id in step["account_ids"]}
        busy = sorted(a for a in fire_account_ids if self.manager.is_account_busy(a))
        if busy:
            labels = [
                self.manager.accounts[a].label if a in self.manager.accounts else a
                for a in busy
            ]
            schedule["last_error"] = f"Fire at {iso(now)} skipped: account(s) busy: {', '.join(labels)}"
            return
        try:
            request = ActionQueueRequest(
                steps=queue["steps"],
                confirm=True,
                delay_between_accounts=queue.get("delay_between_accounts"),
                delay_between_actions=queue.get("delay_between_actions"),
                max_operations=queue.get("max_operations"),
            )
            result = start_action_queue(self.manager, self.queue_runs, request, schedule_id=schedule["id"])
            schedule.setdefault("run_ids", []).append(result["run_id"])
            _trim_runs(schedule)
            schedule["last_error"] = None
        except ValueError as exc:
            # e.g. no authorized accounts at fire time - record but keep the schedule alive
            schedule["last_error"] = f"Fire at {iso(now)} skipped: {exc}"

    async def _tick_native(self, schedule: dict[str, Any], now: datetime) -> datetime | None:
        recurrence = schedule["recurrence"]
        anchor = parse_iso(schedule["anchor_at"]) or now
        last_reconcile = parse_iso(schedule.get("last_reconcile_at"))
        due = last_reconcile is None or (now - last_reconcile) >= NATIVE_RECONCILE_INTERVAL

        deferred = False
        if due:
            if await self._reconcile_native(schedule, now):
                schedule["last_reconcile_at"] = iso(now)
            else:
                # An account was busy with a run; the buffer top-up is skipped this
                # round. Leave last_reconcile_at so it stays "due" and retry soon.
                deferred = True

        schedule["fires_done"] = fires_elapsed(anchor, recurrence, now)
        upcoming = next_future_slot(anchor, recurrence, now)
        schedule["next_fire_at"] = iso(upcoming) if upcoming else None
        schedule["updated_at"] = iso(now)

        planned = total_planned(recurrence)
        if upcoming is None and (planned is not None or parse_iso(recurrence.get("end_until"))):
            self._complete(schedule)
            return None

        next_reconcile = now + (NATIVE_RECONCILE_DEFER if deferred else NATIVE_RECONCILE_INTERVAL)
        candidates = [next_reconcile]
        if upcoming:
            candidates.append(upcoming)
        return min(candidates)

    async def _reconcile_native(self, schedule: dict[str, Any], now: datetime) -> bool:
        """Top up the per-chat native buffers. Returns True if it ran, or False if
        an account was busy and the reconcile was deferred to the next tick."""
        recurrence = schedule["recurrence"]
        anchor = parse_iso(schedule["anchor_at"]) or now
        horizon = native_horizon(recurrence, now)
        desired = upcoming_fire_times(anchor, recurrence, now, horizon, TELEGRAM_SCHEDULED_PER_CHAT_LIMIT)
        native_chats: dict[str, Any] = schedule.setdefault("native_chats", {})
        coverage: datetime | None = None
        stagger = int(recurrence.get("stagger_seconds") or 0)
        account_ids = sorted({account_id for step in schedule["queue"]["steps"] for account_id in step["account_ids"]})
        warmed: list[str] = []
        chat_index = 0
        capped = False
        # Non-blocking exclusive hold of the session locks: if any account is mid-run
        # or mid-read, skip this reconcile (the tick retries soon) rather than block
        # the scheduler loop — which holds self._lock and would freeze every schedule
        # endpoint behind it. The hold also stops opening a `.session` a run is using.
        if not await self.manager.try_begin_exclusive(account_ids):
            return False
        try:
            for step_index, step in enumerate(schedule["queue"]["steps"]):
                payload = native_payload_for_step(step)
                if payload is None:
                    continue
                for account_id in step["account_ids"]:
                    client = await self._warm(account_id, warmed)
                    if client is None:
                        chat_index += len(step["targets"])
                        continue
                    for target in step["targets"]:
                        key = f"{account_id}|{step_index}|{target}"
                        offset = timedelta(seconds=stagger * chat_index)
                        chat_index += 1
                        chat_coverage, chat_capped = await self._reconcile_chat(
                            client, native_chats, key, target, payload, desired, offset
                        )
                        capped = capped or chat_capped
                        if chat_coverage and (coverage is None or chat_coverage > coverage):
                            coverage = chat_coverage
            schedule["coverage_until"] = iso(coverage) if coverage else None
            # Telegram caps scheduled messages at 100 per chat; surface it when a
            # chat is full so the operator knows later fires may not pre-deliver.
            schedule["coverage_warning"] = (
                f"A chat is at Telegram's {TELEGRAM_SCHEDULED_PER_CHAT_LIMIT}-scheduled-message "
                "limit; later fires won't pre-deliver until earlier ones send. Reopen "
                "TeleManager periodically to refill."
                if capped
                else None
            )
            schedule["last_error"] = None
        finally:
            await self.manager.release_run_clients(account_ids)
            self.manager.end_exclusive(account_ids)
        return True

    async def _warm(self, account_id: str, warmed: list[str]):
        try:
            client = await self.manager.warm_client(account_id)
            warmed.append(account_id)
            return client
        except Exception as exc:  # noqa: BLE001 - unauthorized/offline account, skip it this round
            logger.warning("Native schedule could not warm account %s: %s", account_id, exc)
            return None

    async def _reconcile_chat(
        self,
        client: Any,
        native_chats: dict[str, Any],
        key: str,
        target: str,
        payload: dict[str, Any],
        desired: list[datetime],
        offset: timedelta = timedelta(0),
    ) -> tuple[datetime | None, bool]:
        """Top up a chat's native buffer toward `desired`. Returns (latest covered
        time, capped) where `capped` is True if Telegram's per-chat limit stopped us
        from covering every desired fire."""
        entry = native_chats.setdefault(key, {"target": target, "ids": {}})
        existing = await list_scheduled_message_times(client, target)
        # Drop ids that Telegram already delivered or that no longer exist.
        tracked: dict[str, str] = {
            str(mid): when for mid, when in entry["ids"].items() if int(mid) in existing
        }
        covered = {parse_iso(when) for when in tracked.values()}
        room = TELEGRAM_SCHEDULED_PER_CHAT_LIMIT - len(existing)
        capped = False
        first = True
        for fire in desired:
            send_at = fire + offset
            if send_at in covered:
                continue
            if room <= 0:
                capped = True  # wanted to schedule more but the chat is full
                break
            if not first:
                await safe_delay(NATIVE_SEND_DELAY)
            first = False
            message_id = await _create_native(client, target, payload, send_at)
            tracked[str(message_id)] = iso(send_at)
            covered.add(send_at)
            room -= 1
        entry["ids"] = tracked
        scheduled_times = [parse_iso(when) for when in tracked.values()]
        valid_times = [when for when in scheduled_times if when is not None]
        return (max(valid_times) if valid_times else None), capped

    def _complete(self, schedule: dict[str, Any]) -> None:
        schedule["status"] = "completed"
        schedule["next_fire_at"] = None
        schedule["updated_at"] = iso(utcnow())
        log_event(
            "schedule_completed",
            "Schedule completed",
            schedule.get("name", schedule.get("id", "")),
            {"schedule_id": schedule.get("id"), "fires_done": schedule.get("fires_done")},
        )

    async def teardown_native(self, schedule: dict[str, Any]) -> None:
        """Delete any Telegram-native scheduled messages this schedule created.

        Holds session_guard (blocking) rather than the non-blocking exclusive hold:
        teardown runs off the scheduler lock, and orphaned scheduled messages keep
        sending, so it's worth waiting for an in-flight run to release the session
        instead of skipping cleanup."""
        if schedule.get("engine") != "native":
            return
        native_chats: dict[str, Any] = schedule.get("native_chats", {})
        account_ids = sorted({account_id for step in schedule["queue"]["steps"] for account_id in step["account_ids"]})
        if not account_ids:
            return
        warmed: list[str] = []
        async with self.manager.session_guard(account_ids):
            try:
                for step_index, step in enumerate(schedule["queue"]["steps"]):
                    for account_id in step["account_ids"]:
                        for target in step["targets"]:
                            key = f"{account_id}|{step_index}|{target}"
                            entry = native_chats.get(key)
                            if not entry or not entry.get("ids"):
                                continue
                            client = await self._warm(account_id, warmed)
                            if client is None:
                                continue
                            await delete_scheduled_messages(client, target, [int(mid) for mid in entry["ids"]])
                            entry["ids"] = {}
            finally:
                await self.manager.release_run_clients(account_ids)
