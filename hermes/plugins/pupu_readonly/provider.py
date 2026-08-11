from __future__ import annotations

import fcntl
import json
import os
import re
import subprocess
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
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
SAFE_RESULT_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
SAFE_IDENTITY_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$")


class ProviderConfigurationError(ValueError):
    pass

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


def provider_timeout_seconds(env: dict[str, str] | os._Environ[str] = os.environ) -> int:
    raw = env.get("PUPU_TOOL_TIMEOUT_SECONDS", "75")
    try:
        timeout = int(raw)
    except (TypeError, ValueError) as exc:
        raise ProviderConfigurationError(
            "PUPU_TOOL_TIMEOUT_SECONDS must be an integer from 10 to 180"
        ) from exc
    if not 10 <= timeout <= 180:
        raise ProviderConfigurationError(
            "PUPU_TOOL_TIMEOUT_SECONDS must be an integer from 10 to 180"
        )
    return timeout


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

def persist_run_result(
    result_json: str,
    *,
    task_id: str,
    tool_name: str,
    run_id: str | None = None,
    tool_call_id: str | None = None,
) -> Path:
    if not SAFE_RESULT_KEY.fullmatch(task_id):
        raise ValueError("unsafe task_id")
    if not SAFE_RESULT_KEY.fullmatch(tool_name):
        raise ValueError("unsafe tool_name")
    if run_id is not None and not SAFE_IDENTITY_KEY.fullmatch(run_id):
        raise ValueError("unsafe run_id")
    if tool_call_id is not None and not SAFE_IDENTITY_KEY.fullmatch(tool_call_id):
        raise ValueError("unsafe tool_call_id")

    root = Path(
        os.environ.get("PUPU_RESULT_DIR", "/home/pupu/.hermes/run-artifacts")
    )
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)

    validated = json.loads(parse_cli_output(result_json))
    lock_path = root / f".{task_id}.lock"
    lock_descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(lock_descriptor, fcntl.LOCK_EX)
        sequence_path = root / f".{task_id}.sequence"
        try:
            previous_sequence = int(sequence_path.read_text(encoding="utf-8").strip())
        except (FileNotFoundError, ValueError):
            previous_sequence = 0
        sequence = previous_sequence + 1
        sequence_temporary = root / f".{task_id}.sequence.{uuid4().hex}.tmp"
        sequence_descriptor = os.open(
            sequence_temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        try:
            with os.fdopen(sequence_descriptor, "w", encoding="utf-8") as handle:
                handle.write(str(sequence))
            os.replace(sequence_temporary, sequence_path)
            sequence_path.chmod(0o600)
        finally:
            if sequence_temporary.exists():
                sequence_temporary.unlink()

        artifact_id = uuid4().hex
        payload = {
            "artifact_id": artifact_id,
            "task_id": task_id,
            "tool_name": tool_name,
            "sequence": sequence,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "result": validated,
        }
        if run_id is not None:
            payload["run_id"] = run_id
        if tool_call_id is not None:
            payload["tool_call_id"] = tool_call_id

        destination = root / f"{task_id}.{sequence:06d}.{artifact_id}.json"
        temporary = root / f".{task_id}.{artifact_id}.{os.getpid()}.tmp"
        descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False)
            os.replace(temporary, destination)
            destination.chmod(0o600)
        finally:
            if temporary.exists():
                temporary.unlink()
    finally:
        fcntl.flock(lock_descriptor, fcntl.LOCK_UN)
        os.close(lock_descriptor)
    return destination


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
        completed = runner(
            argv, timeout=provider_timeout_seconds(), max_output_bytes=MAX_OUTPUT_BYTES
        )
    except ProviderConfigurationError as exc:
        return error_json("invalid_configuration", str(exc))
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
