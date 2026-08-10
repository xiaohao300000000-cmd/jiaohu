from __future__ import annotations

from typing import Any

from .provider import run_pupu

TOOLSET = "pupu_readonly"


def _schema(name: str, description: str, properties=None, required=None):
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties or {},
            "required": required or [],
            "additionalProperties": False,
        },
    }


TOOL_DEFINITIONS = [
    (
        "pupu_capabilities",
        "capabilities",
        _schema("pupu_capabilities", "List the available Pupu CLI capabilities."),
    ),
    (
        "pupu_auth_status",
        "login.status",
        _schema("pupu_auth_status", "Read the current Pupu authentication status."),
    ),
    (
        "pupu_search_catalog",
        "catalog.search",
        _schema(
            "pupu_search_catalog",
            "Search the live Pupu catalog. Returns real provider data or a typed provider error.",
            {
                "query": {"type": "string", "description": "Product search terms."},
                "size": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 50,
                    "default": 5,
                },
            },
            ["query"],
        ),
    ),
    (
        "pupu_get_product",
        "catalog.detail",
        _schema(
            "pupu_get_product",
            "Read one live Pupu product by its provider identifiers.",
            {
                "store_product_id": {"type": "string"},
                "product_id": {"type": "string"},
            },
            ["store_product_id", "product_id"],
        ),
    ),
    (
        "pupu_read_cart",
        "cart.read",
        _schema("pupu_read_cart", "Read the current Pupu cart without changing it."),
    ),
]


def register(ctx: Any) -> None:
    for name, operation, schema in TOOL_DEFINITIONS:
        def handler(params, _operation=operation, **kwargs):
            del kwargs
            return run_pupu(_operation, dict(params or {}))

        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=handler,
            description=schema["description"],
        )


__all__ = ["register", "run_pupu"]
