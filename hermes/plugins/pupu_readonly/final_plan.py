from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .provider import persist_run_result
from .scope_ticket import ScopeTicketError, consume_scope_ticket


class FinalPlanItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: UUID
    quantity: int = Field(ge=1, le=20)


class FinalPlanSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    explanation: str = Field(min_length=1, max_length=2000)
    items: list[FinalPlanItem] = Field(min_length=1, max_length=40)


def candidate_id(
    task_id: str,
    task_version: int,
    run_id: str,
    store_product_id: str,
) -> str:
    return str(uuid5(
        NAMESPACE_URL,
        f"{task_id}:{task_version}:{run_id}:{store_product_id}",
    ))


def add_candidate_ids(
    result_json: str,
    *,
    session_id: str,
    run_id: str,
    operation: str,
) -> str:
    root = Path(os.environ.get(
        "PUPU_SCOPE_TICKET_DIR",
        "/home/pupu/.local/state/jiaohu/pupu-login/scope-tickets",
    ))
    scope = consume_scope_ticket(root, session_id, operation)
    value = json.loads(result_json)
    data = value.get("data")
    items = data.get("items") if isinstance(data, dict) else None
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict) and isinstance(
                item.get("store_product_id"), str
            ):
                item["candidate_id"] = candidate_id(
                    scope.task_id,
                    scope.task_version,
                    run_id,
                    item["store_product_id"],
                )
    return json.dumps(value, ensure_ascii=False)


def submit_final_plan(params: Any, **kwargs: Any) -> str:
    session_id = kwargs.get("task_id")
    run_id = kwargs.get("run_id")
    tool_call_id = kwargs.get("tool_call_id")
    if not isinstance(session_id, str) or not isinstance(run_id, str):
        raise ScopeTicketError("trusted task run identity is missing")
    root = Path(os.environ.get(
        "PUPU_SCOPE_TICKET_DIR",
        "/home/pupu/.local/state/jiaohu/pupu-login/scope-tickets",
    ))
    scope = consume_scope_ticket(root, session_id, "plan.submit")
    try:
        submission = FinalPlanSubmission.model_validate(params or {})
    except ValidationError as exc:
        raise ValueError("invalid final plan submission") from exc
    ids = [item.candidate_id for item in submission.items]
    if len(set(ids)) != len(ids):
        raise ValueError("candidate IDs must be unique")

    envelope = {
        "schema_version": "1",
        "ok": True,
        "operation": "task.plan.submit",
        "request_id": str(uuid4()),
        "household_id": None,
        "status": "succeeded",
        "data": {
            "task_id": scope.task_id,
            "task_version": scope.task_version,
            "run_id": run_id,
            "plan": submission.model_dump(mode="json"),
        },
        "error": None,
        "next_actions": [],
        "evidence_ref": None,
    }
    result = json.dumps(envelope, ensure_ascii=False)
    if os.environ.get("PUPU_RESULT_DIR"):
        persist_run_result(
            result,
            task_id=session_id,
            tool_name="submit_final_plan",
            run_id=run_id,
            tool_call_id=tool_call_id if isinstance(tool_call_id, str) else None,
        )
    return result


class TaskContextPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    peopleCount: int | None = Field(default=None, ge=1, le=100)
    budgetCents: int | None = Field(default=None, ge=0)
    dietaryRequirements: list[str] | None = Field(default=None, max_length=30)
    requirementsToAdd: list[str] | None = Field(default=None, max_length=30)


class TaskProposalSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: str
    domain: str
    goal: str
    requestedCapabilities: list[str] = Field(max_length=8)
    contextPatch: TaskContextPatch


def submit_task_proposal(params: Any, **kwargs: Any) -> str:
    session_id = kwargs.get("task_id")
    run_id = kwargs.get("run_id")
    tool_call_id = kwargs.get("tool_call_id")
    if not isinstance(session_id, str) or not isinstance(run_id, str):
        raise ValueError("trusted task agent run identity is missing")
    try:
        proposal = TaskProposalSubmission.model_validate(params or {})
    except ValidationError as exc:
        raise ValueError("invalid task proposal") from exc
    envelope = {
        "schema_version": "1",
        "ok": True,
        "operation": "task.proposal.submit",
        "request_id": str(uuid4()),
        "household_id": None,
        "status": "succeeded",
        "data": {"proposal": proposal.model_dump(mode="json", exclude_none=True)},
        "error": None,
        "next_actions": [],
        "evidence_ref": None,
    }
    result = json.dumps(envelope, ensure_ascii=False)
    if os.environ.get("PUPU_RESULT_DIR"):
        persist_run_result(
            result,
            task_id=session_id,
            tool_name="submit_task_proposal",
            run_id=run_id,
            tool_call_id=tool_call_id if isinstance(tool_call_id, str) else None,
        )
    return result
