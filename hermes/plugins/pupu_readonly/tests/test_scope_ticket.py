import json
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path

import pytest

from hermes.plugins.pupu_readonly.scope_ticket import ScopeTicketError, consume_scope_ticket


def write_ticket(root: Path, session_id: str, **overrides):
    payload = {
        "version": 2,
        "sessionId": session_id,
        "taskId": "task-1",
        "taskVersion": 3,
        "capabilities": ["commerce.catalog.search"],
        "accountId": "acct_0123456789abcdef0123456789abcdef",
        "accountsRoot": "/srv/accounts",
        "dataRoot": "/srv/data",
        "receiverId": "receiver-a",
        "storeId": "store-a",
        "placeId": "place-a",
        "expiresAt": "2999-01-01T00:00:00.000Z",
        "nonce": "abcdef0123456789abcdef0123456789",
        **overrides,
    }
    path = root / f"{session_id}.json"
    path.write_text(json.dumps(payload))
    os.chmod(path, 0o600)
    return path


def consume(root: Path, session_id: str, operation: str = "catalog.search"):
    return consume_scope_ticket(
        root,
        session_id,
        operation,
        expected_task_id="task-1",
        expected_task_version=3,
    )


def test_reuses_matching_ticket_within_one_agent_task(tmp_path):
    path = write_ticket(tmp_path, "journey-1")
    scope = consume(tmp_path, "journey-1")
    assert scope.task_id == "task-1"
    assert scope.task_version == 3
    assert scope.allowed_operations == frozenset({"catalog.search", "catalog.detail"})
    assert scope.account_id.startswith("acct_")
    assert scope.accounts_root == Path("/srv/accounts")
    assert path.exists()
    assert consume(tmp_path, "journey-1") == scope


def test_reuses_matching_ticket_concurrently(tmp_path):
    path = write_ticket(tmp_path, "journey-concurrent")
    with ThreadPoolExecutor(max_workers=4) as pool:
        scopes = list(pool.map(
            lambda _: consume(tmp_path, "journey-concurrent"),
            range(4),
        ))
    assert len({scope.account_id for scope in scopes}) == 1
    assert path.exists()


def test_rejects_symlink_ticket(tmp_path):
    target = write_ticket(tmp_path, "real-ticket")
    link = tmp_path / "journey-link.json"
    link.symlink_to(target)
    with pytest.raises(ScopeTicketError):
        consume(tmp_path, "journey-link")
    assert target.exists()


@pytest.mark.parametrize("overrides", [
    {"sessionId": "other"},
    {"expiresAt": "2000-01-01T00:00:00.000Z"},
    {"accountsRoot": "../escape"},
    {"nonce": ""},
    {"taskId": "../task"},
    {"taskVersion": 0},
    {"capabilities": ["commerce.cart.write"]},
])
def test_rejects_mismatch_expiry_malformed_and_removes_ticket(tmp_path, overrides):
    path = write_ticket(tmp_path, "journey-2", **overrides)
    with pytest.raises(ScopeTicketError):
        consume(tmp_path, "journey-2")
    assert not path.exists()


@pytest.mark.parametrize("expected_task_id,expected_version", [
    ("task-other", 3),
    ("task-1", 4),
])
def test_rejects_task_or_version_mismatch(tmp_path, expected_task_id, expected_version):
    path = write_ticket(tmp_path, "journey-version")
    with pytest.raises(ScopeTicketError):
        consume_scope_ticket(
            tmp_path,
            "journey-version",
            "catalog.search",
            expected_task_id=expected_task_id,
            expected_task_version=expected_version,
        )
    assert not path.exists()


def test_denies_operation_absent_from_capabilities(tmp_path):
    path = write_ticket(
        tmp_path,
        "journey-denied",
        capabilities=["commerce.cart.read"],
    )
    with pytest.raises(ScopeTicketError):
        consume_scope_ticket(tmp_path, "journey-denied", "catalog.search")
    assert not path.exists()
