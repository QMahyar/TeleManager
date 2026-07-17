# pyright: reportMissingImports=false
"""Local-only guard: the Host-header allowlist defeats DNS-rebinding against the
no-auth localhost API. See main.ALLOWED_HOSTS / TrustedHostMiddleware."""

from __future__ import annotations

import pytest


def test_foreign_host_header_is_rejected(client) -> None:
    # A rebinding attacker's page reaches us with its own hostname in Host.
    response = client.get("/api/config", headers={"host": "evil.example.com"})
    assert response.status_code == 400


def test_allowed_host_is_accepted(client) -> None:
    # Default base_url host (127.0.0.1) is on the allowlist.
    response = client.get("/api/config")
    assert response.status_code == 200


def test_localhost_with_port_is_accepted(client) -> None:
    # Port is stripped before matching, so ":8000" / dev-proxy hosts pass.
    response = client.get("/api/config", headers={"host": "localhost:8000"})
    assert response.status_code == 200


def test_foreign_origin_blocks_shutdown_before_side_effect(app_context: dict, monkeypatch) -> None:
    started: list[bool] = []
    system = __import__("telemanager.routes.system", fromlist=["threading"])

    class FakeTimer:
        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            started.append(True)

    monkeypatch.setattr(system.threading, "Timer", FakeTimer)
    response = app_context["client"].post("/api/app/shutdown", headers={"origin": "https://evil.example"})
    assert response.status_code == 403
    assert started == []


@pytest.mark.parametrize(
    "origin",
    ["null", "not an origin", "http://user:pass@localhost:8000", "http://localhost:bad"],
)
def test_untrusted_origins_are_rejected(client, origin: str) -> None:
    response = client.post("/api/accounts/login", headers={"origin": origin})
    assert response.status_code == 403


def test_cross_site_fetch_metadata_is_rejected(client) -> None:
    response = client.post("/api/accounts/login", headers={"sec-fetch-site": "cross-site"})
    assert response.status_code == 403


def test_local_and_non_browser_mutations_reach_route(client) -> None:
    local = client.post(
        "/api/accounts/login",
        headers={"origin": "http://127.0.0.1:8000"},
    )
    vite = client.post(
        "/api/accounts/login",
        headers={"origin": "http://localhost:5173", "host": "localhost:8000"},
    )
    cli = client.post("/api/accounts/login")
    assert {local.status_code, vite.status_code, cli.status_code} == {422}


def test_ipv6_origin_helper(app_context: dict) -> None:
    assert app_context["main"].is_trusted_browser_origin("http://[::1]:8000")


def test_foreign_origin_does_not_block_safe_method(client) -> None:
    response = client.get("/api/config", headers={"origin": "https://evil.example"})
    assert response.status_code == 200
