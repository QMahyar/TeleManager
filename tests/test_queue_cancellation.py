from __future__ import annotations


def seed_run(main, run_id: str, status: str) -> dict:
    run = {
        "id": run_id,
        "status": status,
        "created_at": main.now_iso(),
        "updated_at": main.now_iso(),
        "completed_at": None,
        "operation_count": 2,
        "completed_count": 0,
        "ok_count": 0,
        "failed_count": 0,
        "current": None,
        "operations": [],
        "results": [],
        "error": None,
        "audit_event_id": None,
        "cancel_requested": False,
    }
    main.queue_runs[run_id] = run
    return run


def test_cancel_running_queue_marks_canceling(app_context: dict, client):
    seed_run(app_context["main"], "run-1", "running")

    response = client.post("/api/actions/queue/runs/run-1/cancel")

    assert response.status_code == 200
    run = response.json()["run"]
    assert run["status"] == "canceling"
    assert run["cancel_requested"] is True


def test_cancel_terminal_queue_is_idempotent(app_context: dict, client):
    seed_run(app_context["main"], "run-2", "completed")

    response = client.post("/api/actions/queue/runs/run-2/cancel")

    assert response.status_code == 200
    run = response.json()["run"]
    assert run["status"] == "completed"
    assert run["cancel_requested"] is False


def test_cancel_missing_queue_returns_404(client):
    response = client.post("/api/actions/queue/runs/missing/cancel")

    assert response.status_code == 404
    assert response.json()["detail"] == "Queue run was not found."
