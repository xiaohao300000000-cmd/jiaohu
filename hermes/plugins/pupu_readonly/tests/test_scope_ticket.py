import json
import os
from pathlib import Path
import pytest

from hermes.plugins.pupu_readonly.scope_ticket import ScopeTicketError, consume_scope_ticket


def write_ticket(root: Path, task_id: str, **overrides):
    payload = {
        "version": 1,
        "sessionId": task_id,
        "accountId": "acct_0123456789abcdef0123456789abcdef",
        "accountsRoot": "/srv/accounts",
        "dataRoot": "/srv/data",
        "expiresAt": "2999-01-01T00:00:00.000Z",
        "nonce": "abcdef0123456789abcdef0123456789",
        **overrides,
    }
    path = root / f"{task_id}.json"
    path.write_text(json.dumps(payload))
    os.chmod(path, 0o600)
    return path


def test_consumes_matching_ticket_once(tmp_path):
    path = write_ticket(tmp_path, "journey-1")
    scope = consume_scope_ticket(tmp_path, "journey-1")
    assert scope.account_id.startswith("acct_")
    assert scope.accounts_root == Path("/srv/accounts")
    assert not path.exists()
    with pytest.raises(ScopeTicketError, match="missing"):
        consume_scope_ticket(tmp_path, "journey-1")


@pytest.mark.parametrize("overrides", [
    {"sessionId": "other"},
    {"expiresAt": "2000-01-01T00:00:00.000Z"},
    {"accountsRoot": "../escape"},
    {"nonce": ""},
])
def test_rejects_mismatch_expiry_malformed_and_removes_ticket(tmp_path, overrides):
    path = write_ticket(tmp_path, "journey-2", **overrides)
    with pytest.raises(ScopeTicketError):
        consume_scope_ticket(tmp_path, "journey-2")
    assert not path.exists()

