import json
import subprocess
import pytest

from hermes.plugins.pupu_readonly.provider import (
    build_argv,
    parse_cli_output,
    persist_run_result,
    run_pupu,
)


class RecordingRunner:
    def __init__(self, completed=None):
        self.calls = []
        self.completed = completed

    def __call__(self, argv, *, timeout, max_output_bytes):
        self.calls.append(
            {
                "argv": argv,
                "timeout": timeout,
                "max_output_bytes": max_output_bytes,
            }
        )
        return self.completed


def test_rejects_write_operation_before_process_start():
    runner = RecordingRunner()

    result = json.loads(run_pupu("cart.add", {}, runner=runner))

    assert result["ok"] is False
    assert result["error"]["code"] == "operation_not_allowed"
    assert runner.calls == []


def test_accepts_cli_envelope_and_redacts_sensitive_details():
    envelope = {
        "schema_version": "1",
        "ok": False,
        "operation": "pupu.catalog.search",
        "request_id": "req-1",
        "household_id": "household-1",
        "status": "failed",
        "data": None,
        "error": {
            "code": "pupu_transport_error",
            "message": "provider rejected request",
            "retryable": True,
            "details": {"authorization": "secret", "safe_code": "E1"},
        },
        "next_actions": [],
        "evidence_ref": None,
    }

    result = json.loads(parse_cli_output(json.dumps(envelope)))

    assert result["error"]["details"] == {"safe_code": "E1"}


def test_builds_argv_without_shell_interpolation(monkeypatch):
    monkeypatch.setenv("PUPU_CLI_PATH", "/opt/pupu/bin/pupu")
    monkeypatch.setenv("PUPU_DATA_DIR", "/srv/pupu/private")
    monkeypatch.setenv("PUPU_HOUSEHOLD_ID", "household-1")

    argv = build_argv(
        "catalog.search",
        {"query": "牛奶; rm -rf /", "size": 3, "request_id": "req-2"},
    )

    assert argv == [
        "/opt/pupu/bin/pupu",
        "catalog",
        "search",
        "--query",
        "牛奶; rm -rf /",
        "--size",
        "3",
        "--request-id",
        "req-2",
        "--household-id",
        "household-1",
        "--data-root",
        "/srv/pupu/private",
        "--json",
    ]


def test_maps_timeout_to_typed_error():
    def timeout_runner(argv, *, timeout, max_output_bytes):
        del argv, timeout, max_output_bytes
        raise subprocess.TimeoutExpired(["pupu"], 30)

    result = json.loads(run_pupu("capabilities", {}, runner=timeout_runner))

    assert result["ok"] is False
    assert result["error"]["code"] == "provider_timeout"
    assert result["error"]["retryable"] is True


def test_rejects_non_json_and_oversized_output():
    invalid = json.loads(parse_cli_output("not-json"))
    oversized = json.loads(parse_cli_output("x" * 1_000_001))

    assert invalid["error"]["code"] == "invalid_provider_output"
    assert oversized["error"]["code"] == "provider_output_too_large"

def test_persists_validated_result_by_safe_task_id(tmp_path, monkeypatch):
    monkeypatch.setenv("PUPU_RESULT_DIR", str(tmp_path))
    envelope = json.dumps(
        {
            "schema_version": "1",
            "ok": True,
            "operation": "pupu.capabilities",
            "request_id": "provider-1",
            "household_id": None,
            "status": "succeeded",
            "data": {"operations": []},
            "error": None,
            "next_actions": [],
            "evidence_ref": None,
        }
    )

    first_path = persist_run_result(
        envelope,
        task_id="session-1",
        tool_name="pupu_capabilities",
        run_id="run-1",
        tool_call_id="run-1:pupu_capabilities:1",
    )
    first = json.loads(first_path.read_text())
    first_mode = first_path.stat().st_mode
    first_path.unlink()

    second_path = persist_run_result(
        envelope,
        task_id="session-1",
        tool_name="pupu_read_cart",
        run_id="run-1",
        tool_call_id="call-2",
    )
    second = json.loads(second_path.read_text())

    assert first_path != second_path
    assert first["task_id"] == "session-1"
    assert first["run_id"] == "run-1"
    assert first["tool_call_id"] == "run-1:pupu_capabilities:1"
    assert first["sequence"] == 1
    assert second["sequence"] == 2
    assert second["tool_name"] == "pupu_read_cart"
    assert first["result"]["operation"] == "pupu.capabilities"
    assert first_mode & 0o777 == 0o600
    assert second_path.stat().st_mode & 0o777 == 0o600


def test_rejects_unsafe_task_id_for_result_path(tmp_path, monkeypatch):
    monkeypatch.setenv("PUPU_RESULT_DIR", str(tmp_path))

    with pytest.raises(ValueError, match="unsafe task_id"):
        persist_run_result("{}", task_id="../escape", tool_name="pupu_read_cart")
