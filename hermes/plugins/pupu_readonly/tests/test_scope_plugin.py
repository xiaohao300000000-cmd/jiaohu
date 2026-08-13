import json
import os
from pathlib import Path

from hermes.plugins.pupu_readonly.provider import run_pupu


def write_ticket(root: Path, session_id: str, capabilities=None):
    payload = {
        "version": 2,
        "sessionId": session_id,
        "taskId": "task-1",
        "taskVersion": 3,
        "capabilities": capabilities or ["commerce.catalog.search"],
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
    path.write_text(json.dumps(payload))
    os.chmod(path, 0o600)


class RecordingRunner:
    def __init__(self):
        self.calls = []

    def __call__(self, argv, *, timeout, max_output_bytes):
        self.calls.append((argv, timeout, max_output_bytes))
        return type("Completed", (), {
            "returncode": 0,
            "stderr": "",
            "stdout": json.dumps({
                "schema_version": "1", "ok": True,
                "operation": "pupu.catalog.search", "request_id": "provider-1",
                "household_id": None, "status": "succeeded",
                "data": {"products": []}, "error": None,
                "next_actions": [], "evidence_ref": None,
            }),
        })()


def test_run_pupu_uses_consumed_ticket_scope(tmp_path, monkeypatch):
    write_ticket(tmp_path, "journey-3")
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    monkeypatch.delenv("PUPU_ACCOUNTS_ROOT", raising=False)
    monkeypatch.delenv("PUPU_DATA_DIR", raising=False)
    runner = RecordingRunner()
    result = json.loads(run_pupu(
        "catalog.search",
        {"query": "milk", "_trusted_task_id": "journey-3"},
        runner=runner,
    ))
    assert result["ok"] is True
    argv = runner.calls[0][0]
    assert argv[argv.index("--account-id") + 1].startswith("acct_")
    assert argv[argv.index("--accounts-root") + 1] == "/srv/accounts"
    assert argv[argv.index("--data-root") + 1] == "/srv/data"
    assert argv[argv.index("--store-id") + 1] == "store-a"
    assert argv[argv.index("--place-id") + 1] == "place-a"
    assert argv[argv.index("--receiver-id") + 1] == "receiver-a"
    assert argv[1:3] == ["catalog", "scoped-search"]


def test_run_pupu_scopes_catalog_detail_to_selected_store(tmp_path, monkeypatch):
    write_ticket(tmp_path, "journey-detail")
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    runner = RecordingRunner()
    result = json.loads(run_pupu(
        "catalog.detail",
        {
            "store_product_id": "store-product-a",
            "product_id": "product-a",
            "_trusted_task_id": "journey-detail",
        },
        runner=runner,
    ))
    assert result["ok"] is True
    argv = runner.calls[0][0]
    assert argv[1:3] == ["catalog", "scoped-detail"]
    assert argv[argv.index("--store-id") + 1] == "store-a"


def test_run_pupu_scopes_cart_read_to_selected_store(tmp_path, monkeypatch):
    write_ticket(tmp_path, "journey-cart", ["commerce.cart.read"])
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    runner = RecordingRunner()
    result = json.loads(run_pupu(
        "cart.read", {"_trusted_task_id": "journey-cart"}, runner=runner,
    ))
    assert result["ok"] is True
    argv = runner.calls[0][0]
    assert argv[1:3] == ["cart", "scoped-read"]
    assert argv[argv.index("--store-id") + 1] == "store-a"


def test_run_pupu_denies_unscoped_operation_before_cli(tmp_path, monkeypatch):
    write_ticket(tmp_path, "journey-denied", ["commerce.cart.read"])
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    runner = RecordingRunner()
    result = json.loads(run_pupu(
        "catalog.search",
        {"query": "milk", "_trusted_task_id": "journey-denied"},
        runner=runner,
    ))
    assert result["error"]["code"] == "scope_ticket_invalid"
    assert runner.calls == []


def test_run_pupu_fails_closed_before_cli_when_ticket_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("PUPU_SCOPE_TICKET_DIR", str(tmp_path))
    runner = RecordingRunner()
    result = json.loads(run_pupu(
        "catalog.search", {"query": "milk", "_trusted_task_id": "missing"}, runner=runner,
    ))
    assert result["error"]["code"] == "scope_ticket_invalid"
    assert runner.calls == []
