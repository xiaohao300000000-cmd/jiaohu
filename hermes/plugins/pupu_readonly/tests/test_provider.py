import json
import subprocess

from hermes.plugins.pupu_readonly.provider import (
    build_argv,
    parse_cli_output,
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
