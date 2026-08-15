from __future__ import annotations

from typing import Any

from .provider import run_pupu


TOOLSET = "pupu_cli"
TOOL_SCHEMA = {
    "name": "pupu_cli",
    "description": (
        "Call any command exposed by the installed Pupu CLI. "
        "Use operation for the command path, such as capabilities, catalog search, "
        "cart add, coupon claim, checkout preview, or checkout create-invite-pay. "
        "Pass the remaining CLI tokens in arguments. Use --help to inspect a command "
        "and --json when structured output is available."
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
