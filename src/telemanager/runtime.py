"""Live application singletons shared across the route modules.

These are created once at import. ``main`` and every ``routes/*`` module import the
SAME instances from here, so the manager, scheduler, and run dict are shared rather
than re-created per router. ``queue_runs`` is a plain dict mutated in place (never
reassigned), so importers all see the same object.

The test harness clears the ``telemanager`` package and re-imports it under a patched
data dir, so these rebind fresh for each test — exactly as when they lived in main.
"""
from __future__ import annotations

from .accounts import AccountManager
from .action_runs_service import load_action_runs
from .schedules_service import SchedulerService

manager = AccountManager()
queue_runs: dict[str, dict] = load_action_runs()
scheduler = SchedulerService(manager, queue_runs)
# In-memory app-password session store (cleared on restart, fine for a local app).
# Lives here, with the other shared singletons, so routes/auth can read it without
# importing main (which would be a circular import — main imports the routes).
active_sessions: dict[str, str] = {}
