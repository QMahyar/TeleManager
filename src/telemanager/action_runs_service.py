from __future__ import annotations

from typing import Any

from .config import ACTION_RUNS_FILE, read_json, write_json

TERMINAL_STATUSES = {"completed", "failed", "interrupted", "canceled", "flood_wait"}


def load_action_runs() -> dict[str, dict[str, Any]]:
    raw_runs = read_json(ACTION_RUNS_FILE, {})
    if not isinstance(raw_runs, dict):
        return {}
    runs: dict[str, dict[str, Any]] = {}
    for run_id, run in raw_runs.items():
        if not isinstance(run, dict):
            continue
        restored = dict(run)
        if restored.get("status") not in TERMINAL_STATUSES:
            restored["status"] = "interrupted"
            restored["current"] = None
            restored["error"] = "TeleManager restarted before this queue finished."
        runs[str(run_id)] = restored
    save_action_runs(runs)
    return runs


def save_action_runs(runs: dict[str, dict[str, Any]]) -> None:
    trimmed = dict(sorted(runs.items(), key=lambda item: item[1].get("created_at", ""), reverse=True)[:100])
    write_json(ACTION_RUNS_FILE, trimmed)


def list_action_runs(runs: dict[str, dict[str, Any]], limit: int = 25) -> list[dict[str, Any]]:
    return sorted(runs.values(), key=lambda item: item.get("created_at", ""), reverse=True)[: max(1, min(limit, 100))]
