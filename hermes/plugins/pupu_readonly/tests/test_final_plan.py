import json
import os

import pytest

from hermes.plugins.pupu_readonly.final_plan import (
    candidate_id,
    submit_final_plan,
)


def write_ticket(root, session_id):
    value = {
        "version": 2,
        "sessionId": session_id,
        "taskId": "50000000-0000-4000-8000-000000000001",
        "taskVersion": 3,
        "capabilities": ["task.plan.submit"],
        "accountId": "acct_0123456789abcdef0123456789abcdef",
        "accountsRoot": "/srv/accounts",
        "dataRoot": "/srv/data",
        "receiverId": "receiver-a",
        "storeId": "store-a",
        "placeId": "place-a",
        "expiresAt": "2999-01-01T00:00:00.000Z",
        "nonce": "abcdef0123456789abcdef0123456789",
    }
    path = root / f"{session_id}.json"
    path.write_text(json.dumps(value))
    os.chmod(path, 0o600)


def test_submit_final_plan_is_scoped_and_persists_no_provider_mutation(
    tmp_path, monkeypatch
):
    write_ticket(tmp_path, "journey-plan")
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    monkeypatch.delenv("PUPU_RESULT_DIR", raising=False)
    selected = candidate_id(
        "50000000-0000-4000-8000-000000000001",
        3,
        "run-1",
        "sku-a",
    )
    result = json.loads(submit_final_plan(
        {
            "title": "牛奶",
            "explanation": "一瓶",
            "items": [{"candidate_id": selected, "quantity": 1}],
        },
        task_id="journey-plan",
        run_id="run-1",
        tool_call_id="call-plan",
    ))

    assert result["operation"] == "task.plan.submit"
    assert result["data"]["task_id"].startswith("50000000-")
    assert result["data"]["task_version"] == 3
    assert result["data"]["plan"]["items"][0]["candidate_id"] == selected


def test_submit_final_plan_rejects_duplicates_and_extra_fields(
    tmp_path, monkeypatch
):
    write_ticket(tmp_path, "journey-duplicate")
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    selected = "50000000-0000-4000-8000-000000000002"
    with pytest.raises(ValueError):
        submit_final_plan(
            {
                "title": "bad",
                "explanation": "bad",
                "items": [
                    {"candidate_id": selected, "quantity": 1},
                    {"candidate_id": selected, "quantity": 2},
                ],
                "price": 1,
            },
            task_id="journey-duplicate",
            run_id="run-1",
        )



def test_search_results_receive_deterministic_candidate_ids(
    tmp_path, monkeypatch
):
    value = {
        "version": 2,
        "sessionId": "journey-search",
        "taskId": "50000000-0000-4000-8000-000000000001",
        "taskVersion": 3,
        "capabilities": ["commerce.catalog.search", "task.plan.submit"],
        "accountId": "acct_0123456789abcdef0123456789abcdef",
        "accountsRoot": "/srv/accounts",
        "dataRoot": "/srv/data",
        "receiverId": "receiver-a",
        "storeId": "store-a",
        "placeId": "place-a",
        "expiresAt": "2999-01-01T00:00:00.000Z",
        "nonce": "abcdef0123456789abcdef0123456789",
    }
    path = tmp_path / "journey-search.json"
    path.write_text(json.dumps(value))
    os.chmod(path, 0o600)
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    from hermes.plugins.pupu_readonly.final_plan import add_candidate_ids
    result = add_candidate_ids(
        json.dumps({"data": {"items": [{"store_product_id": "sku-a"}]}}),
        session_id="journey-search",
        run_id="run-1",
        operation="catalog.search",
    )
    item = json.loads(result)["data"]["items"][0]
    assert item["candidate_id"] == candidate_id(
        value["taskId"], 3, "run-1", "sku-a"
    )
