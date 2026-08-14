from __future__ import annotations

import os
from typing import Any

from .provider import persist_run_result, run_pupu
from .final_plan import add_candidate_ids, submit_final_plan, submit_task_proposal

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
        "pupu_search_meal_catalog",
        "catalog.meal-search",
        _schema(
            "pupu_search_meal_catalog",
            "Sequentially search exactly three live Pupu ingredient groups for a meal plan.",
            {
                "queries": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 3,
                    "maxItems": 3,
                },
            },
            ["queries"],
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
    proposal_schema = _schema(
        "submit_task_proposal",
        "Submit the Agent's structured task interpretation.",
        {
            "operation": {
                "type": "string",
                "enum": ["start", "continue", "research", "revise"],
            },
            "domain": {
                "type": "string",
                "enum": [
                    "general", "commerce", "delivery",
                    "home_automation", "calendar",
                ],
            },
            "goal": {
                "type": "string",
                "enum": [
                    "advice", "find_products", "revise_plan",
                    "prepare_cart", "create_order",
                ],
            },
            "requestedCapabilities": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 8,
            },
            "contextPatch": {
                "type": "object",
                "properties": {
                    "peopleCount": {"type": "integer", "minimum": 1, "maximum": 100},
                    "budgetCents": {"type": "integer", "minimum": 0},
                    "dietaryRequirements": {
                        "type": "array", "items": {"type": "string"},
                    },
                    "requirementsToAdd": {
                        "type": "array", "items": {"type": "string"},
                    },
                },
                "additionalProperties": False,
            },
        },
        [
            "operation", "domain", "goal",
            "requestedCapabilities", "contextPatch",
        ],
    )
    ctx.register_tool(
        name="submit_task_proposal",
        toolset=TOOLSET,
        schema=proposal_schema,
        handler=submit_task_proposal,
        description=proposal_schema["description"],
    )
    final_schema = _schema(
        "submit_final_plan",
        "Submit the one authoritative structured product plan.",
        {
            "title": {"type": "string", "minLength": 1, "maxLength": 120},
            "explanation": {"type": "string", "minLength": 1, "maxLength": 2000},
            "items": {
                "type": "array", "minItems": 1, "maxItems": 40,
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string", "format": "uuid"},
                        "quantity": {"type": "integer", "minimum": 1, "maximum": 20},
                    },
                    "required": ["candidate_id", "quantity"],
                    "additionalProperties": False,
                },
            },
        },
        ["title", "explanation", "items"],
    )
    ctx.register_tool(
        name="submit_final_plan", toolset=TOOLSET, schema=final_schema,
        handler=submit_final_plan, description=final_schema["description"],
    )
    for name, operation, schema in TOOL_DEFINITIONS:
        def handler(params, _operation=operation, _name=name, **kwargs):
            task_id = kwargs.get("task_id")
            arguments = dict(params or {})
            arguments.pop("_trusted_task_id", None)
            arguments.pop("_trusted_scope", None)
            if isinstance(task_id, str) and task_id:
                arguments["_trusted_task_id"] = task_id
            result = run_pupu(_operation, arguments)
            run_id = kwargs.get("run_id")
            if (
                _operation in {"catalog.search", "catalog.meal-search"}
                and isinstance(task_id, str) and task_id
                and isinstance(run_id, str) and run_id
            ):
                result = add_candidate_ids(
                    result, session_id=task_id, run_id=run_id,
                    operation=_operation,
                )
            if (
                isinstance(task_id, str)
                and task_id
                and os.environ.get("PUPU_RESULT_DIR")
            ):
                tool_call_id = kwargs.get("tool_call_id")
                persist_run_result(
                    result,
                    task_id=task_id,
                    tool_name=_name,
                    run_id=run_id if isinstance(run_id, str) else None,
                    tool_call_id=tool_call_id if isinstance(tool_call_id, str) else None,
                )
            return result

        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=handler,
            description=schema["description"],
        )


__all__ = ["register", "run_pupu"]
