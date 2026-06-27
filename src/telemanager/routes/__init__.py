"""FastAPI route modules.

Each module exposes an ``APIRouter`` named ``router`` that ``main`` includes. Handlers
share live state via ``telemanager.runtime`` (manager / scheduler / queue_runs) and
delegate to the service layer; they hold no business logic of their own.
"""
