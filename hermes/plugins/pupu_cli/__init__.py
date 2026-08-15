from __future__ import annotations

from typing import Any

from .provider import run_pupu


TOOLSET = "pupu_cli"
TOOL_SCHEMA = {
    "name": "pupu_cli",
    "description": (
        "Call any command exposed by the installed Pupu CLI. Use only the top-level "
        "command group in operation and put the subcommand first in arguments: "
        'operation="catalog", arguments=["search", "--query", "牛肉", ...]. '
        "Other groups include login, account, address, cart, coupon, checkout, "
        "order, invite-pay, product, recipe, gift, fulfillment, approval, auth-plan, "
        "request-policy, capabilities, and version. The tool exposes the complete CLI "
        "without an operation whitelist and returns CLI output unchanged."
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
