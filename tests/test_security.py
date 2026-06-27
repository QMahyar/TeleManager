# pyright: reportMissingImports=false
"""Local-only guard: the Host-header allowlist defeats DNS-rebinding against the
no-auth localhost API. See main.ALLOWED_HOSTS / TrustedHostMiddleware."""
from __future__ import annotations


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
