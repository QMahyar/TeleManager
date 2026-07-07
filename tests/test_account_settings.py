"""Pure-helper checks for account_settings_service (no live client)."""
import pytest

from telemanager.account_settings_service import (
    _authorization_dict,
    clean_profile_field,
    normalize_username,
    validate_ttl_days,
    validate_username,
)


def test_normalize_username_strips_at_and_space():
    assert normalize_username("  @Cool_User ") == "Cool_User"
    assert normalize_username("@@x") == "x"  # any leading @ is dropped


def test_validate_username_accepts_valid_and_clears_empty():
    assert validate_username("@Cool_User1") == "Cool_User1"
    assert validate_username("   ") == ""  # blank clears the username


@pytest.mark.parametrize("bad", ["abc", "1abc", "has space", "with-dash", "a" * 33])
def test_validate_username_rejects_invalid(bad):
    with pytest.raises(ValueError):
        validate_username(bad)


def test_clean_profile_field_passthrough_and_none():
    assert clean_profile_field("first_name", "  Ada ") == "Ada"
    assert clean_profile_field("first_name", None) is None  # None = leave unchanged


def test_clean_profile_field_enforces_limit():
    with pytest.raises(ValueError):
        clean_profile_field("about", "x" * 141)
    assert clean_profile_field("about", "x" * 140) == "x" * 140  # premium bio boundary


@pytest.mark.parametrize("days", [30, 90, 180, 365])
def test_validate_ttl_days_accepts_standard_periods(days):
    assert validate_ttl_days(days) == days


@pytest.mark.parametrize("bad", [0, 45, 366, 5000, -30])
def test_validate_ttl_days_rejects_nonstandard(bad):
    with pytest.raises(ValueError):
        validate_ttl_days(bad)


def test_authorization_hash_is_stringified_to_avoid_js_precision_loss():
    class FakeAuth:
        hash = 9123456789012345678  # > 2**53
        current = False

    assert _authorization_dict(FakeAuth())["hash"] == "9123456789012345678"


def test_account_settings_router_is_mounted():
    # Guards the wiring: the service/route can be perfect but do nothing unless
    # main.py includes the router. This fails if that include is dropped again.
    from telemanager.main import app

    paths = {route.path for route in app.routes}
    assert "/api/accounts/{account_id}/profile" in paths
    assert "/api/accounts/{account_id}/sessions" in paths
