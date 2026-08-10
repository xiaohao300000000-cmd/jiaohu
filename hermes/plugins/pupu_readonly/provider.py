from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Callable
from typing import Any, Protocol
from uuid import uuid4

from pydantic import ValidationError

from .schemas import CliEnvelope

MAX_OUTPUT_BYTES = 1_000_000
READ_ONLY_OPERATIONS = {
    "capabilities",
    "login.status",
    "catalog.search",
    "catalog.detail",
    "cart.read",
}
SENSITIVE_KEYS = {
    "access_token",
    "authorization",
    "cookie",
    "password",
    "phone",
    "refresh_token",
    "seal",
    "sign",
    "token",
}


class CompletedProcess(Protocol):
    stdout: str
    stderr: str
    returncode: int


class ProcessRunner(Protocol):
    def __call__(
        self,
        argv: list[str],
        *,
        timeout: int,
        max_output_bytes: int,
    ) -> CompletedProcess: ...


def error_json(code: str, message: str, *, retryable: bool = False) -> str:
    return json.dumps(
        {
            "schema_version": "1",
            "ok": False,
            "operation": "pupu.plugin",
            "request_id": str(uuid4()),
            "household_id": None,
            "status": "failed",
            "data": None,
            "error": {
                "code": code,
                "message": message,
                "retryable": retryable,
                "details": None,
            },
            "next_actions": [],
            "evidence_ref": None,
        },
        ensure_ascii=False,
    )


def _required_text(arguments: dict[str, object], key: str) -> str:
    value = arguments.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value


def _append_shared_scope(argv: list[str], arguments: dict[str, object]) -> None:
    request_id = arguments.get("request_id")
    if request_id is not None and (not isinstance(request_id, str) or not request_id):
        raise ValueError("request_id must be a non-empty string")
    argv.extend(["--request-id", request_id or str(uuid4())])

    household_id = arguments.get("household_id") or os.environ.get("PUPU_HOUSEHOLD_ID")
    data_dir = arguments.get("data_root") or os.environ.get("PUPU_DATA_DIR")
    if not isinstance(household_id, str) or not household_id:
        raise ValueError("PUPU_HOUSEHOLD_ID is required")
    if not isinstance(data_dir, str) or not data_dir:
        raise ValueError("PUPU_DATA_DIR is required")
    argv.extend(["--household-id", household_id, "--data-root", data_dir])


def build_argv(operation: str, arguments: dict[str, object]) -> list[str]:
    if operation not in READ_ONLY_OPERATIONS:
        raise ValueError("operation is not allowed")
    cli_path = os.environ.get(
        "PUPU_CLI_PATH", "/home/pupu/providers/pupu-cli/.venv/bin/pupu"
    )
    if operation == "capabilities":
        argv = [cli_path, "capabilities"]
        request_id = arguments.get("request_id")
        if isinstance(request_id, str) and request_id:
            argv.extend(["--request-id", request_id])
        return [*argv, "--json"]

    command, action = operation.split(".", 1)
    argv = [cli_path, command, action]
    if operation == "catalog.search":
        argv.extend(["--query", _required_text(arguments, "query")])
        size = arguments.get("size", 5)
        if not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= 50:
            raise ValueError("size must be an integer from 1 to 50")
        argv.extend(["--size", str(size)])
    elif operation == "catalog.detail":
        argv.extend(
            [
                "--store-product-id",
                _required_text(arguments, "store_product_id"),
                "--product-id",
                _required_text(arguments, "product_id"),
            ]
        )

    _append_shared_scope(argv, arguments)
    return [*argv, "--json"]


def subprocess_runner(
    argv: list[str], *, timeout: int, max_output_bytes: int
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        argv,
        capture_output=True,
        check=False,
        shell=False,
        text=True,
        timeout=timeout,
        env=os.environ.copy(),
    )
    if len(completed.stdout.encode("utf-8")) > max_output_bytes:
        raise OverflowError("provider output exceeded limit")
    return completed


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _redact(item)
            for key, item in value.items()
            if key.lower() not in SENSITIVE_KEYS
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def parse_cli_output(output: str) -> str:
    if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
        return error_json(
            "provider_output_too_large", "Pupu CLI output exceeded the safe limit"
        )
    try:
        raw = json.loads(output)
        envelope = CliEnvelope.model_validate(raw)
    except (json.JSONDecodeError, ValidationError, TypeError):
        return error_json(
            "invalid_provider_output", "Pupu CLI returned an invalid response"
        )
    safe = _redact(envelope.model_dump(mode="json"))
    return json.dumps(safe, ensure_ascii=False)


def run_pupu(
    operation: str,
    arguments: dict[str, object],
    *,
    runner: ProcessRunner = subprocess_runner,
) -> str:
    if operation not in READ_ONLY_OPERATIONS:
        return error_json(
            "operation_not_allowed", "Only read-only Pupu operations are enabled"
        )
    try:
        argv = build_argv(operation, arguments)
        completed = runner(argv, timeout=30, max_output_bytes=MAX_OUTPUT_BYTES)
    except ValueError as exc:
        return error_json("invalid_arguments", str(exc))
    except subprocess.TimeoutExpired:
        return error_json(
            "provider_timeout", "Pupu CLI timed out", retryable=True
        )
    except OverflowError:
        return error_json(
            "provider_output_too_large", "Pupu CLI output exceeded the safe limit"
        )
    except OSError:
        return error_json(
            "provider_unavailable", "Pupu CLI could not be started", retryable=True
        )

    if completed.returncode != 0 and not completed.stdout.strip():
        return error_json(
            "provider_process_failed", "Pupu CLI process failed", retryable=True
        )
    return parse_cli_output(completed.stdout)
