from __future__ import annotations

import asyncio
from typing import Any, cast


def test_parse_advanced_action_options(app_context: dict) -> None:
    actions = __import__("telemanager.telegram_actions", fromlist=["telegram_actions"])

    payload = actions.parse_options("file=E:/tmp/photo.jpg\ncaption=Hello\nparse_mode=markdown")
    assert payload["file"] == "E:/tmp/photo.jpg"
    assert payload["caption"] == "Hello"
    assert payload["parse_mode"] == "markdown"
    assert actions.parse_message_ids("1, 2 3") == [1, 2, 3]
    assert actions.parse_bool("yes") is True
    assert actions.safe_path_name("@demo/chat") == "_demo_chat"


def test_schedule_message_accepts_relative_schedule(app_context: dict) -> None:
    actions = __import__("telemanager.telegram_actions", fromlist=["telegram_actions"])
    captured: dict[str, Any] = {}

    class FakeClient:
        async def send_message(self, target, text, schedule=None):
            captured["target"] = target
            captured["text"] = text
            captured["schedule"] = schedule

    async def run() -> str:
        return await actions.schedule_message(
            cast(Any, FakeClient()),
            "@chat",
            "text=hello\nschedule=+15m",
        )

    detail = asyncio.run(run())
    assert captured["target"] == "@chat"
    assert captured["text"] == "hello"
    assert captured["schedule"] is not None
    assert "scheduled" in detail


def test_message_actions_require_options(app_context: dict) -> None:
    main = app_context["main"]
    request = main.ActionQueueRequest(
        steps=[
            {
                "action_type": "pin_message",
                "account_ids": ["acc-1"],
                "targets": ["@group"],
                "message": "id=42\nnotify=false",
            }
        ]
    )
    assert request.steps[0].action_type == "pin_message"


def _actions_module():
    return __import__("telemanager.telegram_actions", fromlist=["telegram_actions"])


def test_parse_bot_start_handles_all_referral_link_forms(app_context: dict) -> None:
    actions = _actions_module()

    plain = actions.parse_bot_start("@MyBot")
    assert (plain.bot, plain.param, plain.mode) == ("MyBot", "", "start")

    spaced = actions.parse_bot_start("@MyBot ref123")
    assert (spaced.bot, spaced.param, spaced.mode) == ("MyBot", "ref123", "start")

    classic = actions.parse_bot_start("https://t.me/MyBot?start=ref123")
    assert (classic.bot, classic.param, classic.mode) == ("MyBot", "ref123", "start")

    app_main = actions.parse_bot_start("https://t.me/MyBot?startapp=ref123")
    assert (app_main.bot, app_main.param, app_main.mode, app_main.app_short_name) == (
        "MyBot",
        "ref123",
        "startapp",
        "",
    )

    app_named = actions.parse_bot_start("https://t.me/MyBot/play?startapp=ref123")
    assert (app_named.bot, app_named.mode, app_named.app_short_name) == ("MyBot", "startapp", "play")

    tg_link = actions.parse_bot_start("tg://resolve?domain=MyBot&appname=play&startapp=ref")
    assert (tg_link.bot, tg_link.mode, tg_link.app_short_name, tg_link.param) == (
        "MyBot",
        "startapp",
        "play",
        "ref",
    )

    # A numeric second path segment is a message id, not a mini app short name.
    message_link = actions.parse_bot_start("https://t.me/MyBot/123")
    assert message_link.app_short_name == ""


def test_parse_bot_start_option_overrides_link(app_context: dict) -> None:
    actions = _actions_module()

    override = actions.parse_bot_start("@MyBot", "start=fromoption")
    assert (override.param, override.mode) == ("fromoption", "start")

    # An explicit startapp option upgrades a classic link to the mini-app path.
    upgraded = actions.parse_bot_start("https://t.me/MyBot?start=linkval", "startapp=optwins")
    assert (upgraded.param, upgraded.mode) == ("optwins", "startapp")

    # A bare value with no key= prefix is treated as the classic start param.
    bare = actions.parse_bot_start("@MyBot", "ref123")
    assert (bare.param, bare.mode) == ("ref123", "start")


def test_validate_start_param_enforces_classic_limits(app_context: dict) -> None:
    actions = _actions_module()

    too_long = "x" * 65
    try:
        actions.parse_bot_start(f"https://t.me/MyBot?start={too_long}")
        raise AssertionError("Expected a length error for the classic start param.")
    except ValueError as exc:
        assert "at most 64" in str(exc)

    try:
        actions.parse_bot_start("https://t.me/MyBot?start=bad+char")
        raise AssertionError("Expected a charset error for the classic start param.")
    except ValueError as exc:
        assert "letters, digits" in str(exc)

    # startapp is not constrained to the base64url charset.
    loose = actions.parse_bot_start("https://t.me/MyBot?startapp=ref.with.dots")
    assert loose.param == "ref.with.dots"


def test_start_bot_classic_uses_start_bot_request(app_context: dict) -> None:
    actions = _actions_module()
    captured: dict[str, Any] = {}

    class FakeClient:
        async def get_input_entity(self, value):
            captured["entity"] = value
            return f"input:{value}"

        async def __call__(self, request):
            captured["request"] = request

        async def send_message(self, target, text):
            captured["fallback"] = (target, text)

    detail = asyncio.run(actions.start_bot(cast(Any, FakeClient()), "@MyBot", "start=ref123"))
    request = captured["request"]
    assert type(request).__name__ == "StartBotRequest"
    assert request.start_param == "ref123"
    assert "ref123" in detail
    assert "fallback" not in captured


def test_start_bot_without_param_falls_back_to_slash_start(app_context: dict) -> None:
    actions = _actions_module()
    captured: dict[str, Any] = {}

    class FakeClient:
        async def get_input_entity(self, value):
            return f"input:{value}"

        async def __call__(self, request):
            captured["request"] = request

        async def send_message(self, target, text):
            captured["fallback"] = (target, text)

    detail = asyncio.run(actions.start_bot(cast(Any, FakeClient()), "@MyBot", None))
    assert captured["fallback"] == ("MyBot", "/start")
    assert "request" not in captured
    assert "without parameter" in detail


def test_start_bot_mini_app_uses_webview_requests(app_context: dict) -> None:
    actions = _actions_module()
    named: dict[str, Any] = {}

    class FakeClient:
        async def get_input_entity(self, value):
            return f"input:{value}"

        async def __call__(self, request):
            named["request"] = request

    detail = asyncio.run(
        actions.start_bot(cast(Any, FakeClient()), "https://t.me/MyBot/play?startapp=ref123")
    )
    request = named["request"]
    assert type(request).__name__ == "RequestAppWebViewRequest"
    assert request.start_param == "ref123"
    assert "play" in detail

    main_app: dict[str, Any] = {}

    class FakeMainClient:
        async def get_input_entity(self, value):
            return f"input:{value}"

        async def __call__(self, request):
            main_app["request"] = request

    asyncio.run(
        actions.start_bot(cast(Any, FakeMainClient()), "https://t.me/MyBot?startapp=ref123")
    )
    assert type(main_app["request"]).__name__ == "RequestMainWebViewRequest"
    assert main_app["request"].start_param == "ref123"


def test_start_bot_target_classification(app_context: dict) -> None:
    actions = _actions_module()
    assert actions.classify_target_kind("https://t.me/MyBot?startapp=ref") == "bot_link"
    assert actions.classify_target_kind("https://t.me/MyBot/play?startapp=ref") == "bot_link"
    assert actions.classify_target_kind("tg://resolve?domain=MyBot&start=ref") == "bot_link"
    assert actions.classify_target_kind("https://t.me/chan/123") == "public_link"
    # The queue validator accepts a startapp link for start_bot.
    assert actions.validate_target_for_action("start_bot", "https://t.me/MyBot?startapp=ref") is None


def test_read_chat_uses_send_read_acknowledge(app_context: dict) -> None:
    actions = _actions_module()
    captured: dict[str, Any] = {}

    class FakeClient:
        async def send_read_acknowledge(self, entity):
            captured["entity"] = entity
            return True

        async def __call__(self, request):
            captured["raw_request"] = request

    detail = asyncio.run(actions.read_chat(cast(Any, FakeClient()), "https://t.me/somechannel"))
    # Must go through the high-level helper (handles channels), not a raw request.
    assert captured["entity"] == "somechannel"
    assert "raw_request" not in captured
    assert "read" in detail.lower()


def test_parse_forward_source_handles_links_and_multiple_ids(app_context: dict) -> None:
    actions = _actions_module()

    assert actions.parse_forward_source("@channel:12345") == ("@channel", [12345])
    assert actions.parse_forward_source("@channel:101,102,103") == ("@channel", [101, 102, 103])
    assert actions.parse_forward_source("https://t.me/channel/12345") == ("channel", [12345])
    assert actions.parse_forward_source("https://t.me/c/1234567890/55") == ("-1001234567890", [55])
    assert actions.parse_forward_source("-1001234567890:55") == ("-1001234567890", [55])


def test_parse_forward_source_rejects_bad_input(app_context: dict) -> None:
    actions = _actions_module()
    for bad in ["", "noseparator", "@channel:notanid"]:
        try:
            actions.parse_forward_source(bad)
            raise AssertionError(f"Expected rejection for {bad!r}")
        except ValueError:
            pass


def test_forward_message_forwards_multiple_ids(app_context: dict) -> None:
    actions = _actions_module()
    captured: dict[str, Any] = {}

    class FakeClient:
        async def forward_messages(self, dest, messages, from_peer):
            captured["dest"] = dest
            captured["messages"] = messages
            captured["from_peer"] = from_peer

    detail = asyncio.run(
        actions.forward_message(cast(Any, FakeClient()), "@dest", "@source:101,102")
    )
    assert captured["messages"] == [101, 102]
    assert captured["from_peer"] == "@source"
    assert "2 messages" in detail
