from __future__ import annotations

from typing import Any

from .provider import run_pupu


TOOLSET = "pupu_cli"
TOOL_SCHEMA = {
    "name": "pupu_cli",
    "description": (
        "Call any command exposed by the installed Pupu CLI. For a Pupu business "
        "request, first make only this tool call: operation=\"login\", "
        "arguments=[\"status\",\"--household-id\","
        "\"household-f3f3b74a55ae8bf60b6c1172\",\"--data-root\","
        "\"/home/pupu/providers/pupu-cli/.local/private\",\"--json\"]. "
        "Wait for the login result before emitting any business command. If ready, "
        "catalog search is operation=\"catalog\", arguments=[\"search\",\"--query\","
        "\"<keyword>\",\"--size\",\"20\",\"--household-id\","
        "\"household-f3f3b74a55ae8bf60b6c1172\",\"--request-id\",\"<unique-id>\","
        "\"--data-root\",\"/home/pupu/providers/pupu-cli/.local/private\",\"--json\"]. "
        "Use only the top-level command group in operation and put the subcommand "
        "first in arguments. Other groups include account, address, cart, coupon, "
        "checkout, order, invite-pay, product, recipe, gift, fulfillment, approval, "
        "auth-plan, request-policy, capabilities, and version. The tool exposes the "
        "complete CLI without an operation whitelist and returns CLI output unchanged."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "operation": {"type": "string"},
            "arguments": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["operation", "arguments"],
        "additionalProperties": False,
    },
}


def register(ctx: Any) -> None:
    def handler(params, **_kwargs):
        return run_pupu(params["operation"], params["arguments"])

    ctx.register_tool(
        name="pupu_cli",
        toolset=TOOLSET,
        schema=TOOL_SCHEMA,
        handler=handler,
        description=TOOL_SCHEMA["description"],
    )


__all__ = ["register", "run_pupu"]
