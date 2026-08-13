from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import stat

SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
ACCOUNT = re.compile(r"^acct_[a-f0-9]{32}$")
NONCE = re.compile(r"^[a-f0-9]{32}$")
CAPABILITY_OPERATIONS = {
    "commerce.catalog.search": frozenset({"catalog.search", "catalog.detail"}),
    "commerce.catalog.meal-search": frozenset(
        {"catalog.meal-search", "catalog.detail"}
    ),
    "commerce.cart.read": frozenset({"cart.read"}),
}


class ScopeTicketError(ValueError):
    pass


@dataclass(frozen=True)
class TrustedPupuScope:
    task_id: str
    task_version: int
    allowed_operations: frozenset[str]
    account_id: str
    accounts_root: Path
    data_root: Path
    receiver_id: str
    store_id: str
    place_id: str


def _absolute(value: object, name: str) -> Path:
    if not isinstance(value, str):
        raise ScopeTicketError(f"{name} is invalid")
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise ScopeTicketError(f"{name} is invalid")
    return path


def _expires_at(value: object) -> datetime:
    if not isinstance(value, str):
        raise ScopeTicketError("ticket expiry is invalid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ScopeTicketError("ticket expiry is invalid") from exc
    if parsed.tzinfo is None or parsed <= datetime.now(timezone.utc):
        raise ScopeTicketError("scope ticket expired")
    return parsed


def _task_policy(value: dict) -> tuple[str, int, frozenset[str]]:
    task_id = value.get("taskId")
    task_version = value.get("taskVersion")
    capabilities = value.get("capabilities")
    if not isinstance(task_id, str) or not SAFE_ID.fullmatch(task_id):
        raise ScopeTicketError("scope ticket task identity is invalid")
    if (
        not isinstance(task_version, int)
        or isinstance(task_version, bool)
        or task_version < 1
    ):
        raise ScopeTicketError("scope ticket task version is invalid")
    if (
        not isinstance(capabilities, list)
        or not capabilities
        or len(set(capabilities)) != len(capabilities)
        or any(
            not isinstance(capability, str)
            or capability not in CAPABILITY_OPERATIONS
            for capability in capabilities
        )
    ):
        raise ScopeTicketError("scope ticket capabilities are invalid")
    operations = frozenset(
        operation
        for capability in capabilities
        for operation in CAPABILITY_OPERATIONS[capability]
    )
    return task_id, task_version, operations


def consume_scope_ticket(
    root: Path,
    session_id: str,
    operation: str,
    *,
    expected_task_id: str | None = None,
    expected_task_version: int | None = None,
) -> TrustedPupuScope:
    if not SAFE_ID.fullmatch(session_id):
        raise ScopeTicketError("task identity is unsafe")
    source = root / f"{session_id}.json"
    valid = False
    try:
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(source, flags)
        except FileNotFoundError as exc:
            raise ScopeTicketError("scope ticket missing") from exc
        except OSError as exc:
            raise ScopeTicketError("scope ticket is not a regular file") from exc
        try:
            mode = os.fstat(descriptor).st_mode
            if not stat.S_ISREG(mode) or stat.S_IMODE(mode) != 0o600:
                raise ScopeTicketError("scope ticket permissions are invalid")
            with os.fdopen(descriptor, "r", encoding="utf-8") as handle:
                descriptor = -1
                value = json.load(handle)
        except (json.JSONDecodeError, OSError) as exc:
            raise ScopeTicketError("scope ticket is malformed") from exc
        finally:
            if descriptor >= 0:
                os.close(descriptor)
        if not isinstance(value, dict) or value.get("version") != 2:
            raise ScopeTicketError("scope ticket is malformed")
        if value.get("sessionId") != session_id:
            raise ScopeTicketError("scope ticket identity mismatch")
        task_id, task_version, allowed_operations = _task_policy(value)
        if expected_task_id is not None and task_id != expected_task_id:
            raise ScopeTicketError("scope ticket task mismatch")
        if (
            expected_task_version is not None
            and task_version != expected_task_version
        ):
            raise ScopeTicketError("scope ticket task version mismatch")
        if operation not in allowed_operations:
            raise ScopeTicketError("scope ticket operation is not allowed")
        account_id = value.get("accountId")
        if not isinstance(account_id, str) or not ACCOUNT.fullmatch(account_id):
            raise ScopeTicketError("scope ticket account is invalid")
        accounts_root = _absolute(value.get("accountsRoot"), "accounts root")
        data_root = _absolute(value.get("dataRoot"), "data root")
        receiver_id = value.get("receiverId")
        store_id = value.get("storeId")
        place_id = value.get("placeId")
        if not all(isinstance(item, str) and SAFE_ID.fullmatch(item) for item in (
            receiver_id, store_id, place_id,
        )):
            raise ScopeTicketError("scope ticket address binding is invalid")
        _expires_at(value.get("expiresAt"))
        nonce = value.get("nonce")
        if not isinstance(nonce, str) or not NONCE.fullmatch(nonce):
            raise ScopeTicketError("scope ticket nonce is invalid")
        expected_accounts = os.environ.get("PUPU_ACCOUNTS_ROOT")
        expected_data = os.environ.get("PUPU_DATA_DIR")
        if expected_accounts and accounts_root != Path(expected_accounts):
            raise ScopeTicketError("accounts root is not allowlisted")
        if expected_data and data_root != Path(expected_data):
            raise ScopeTicketError("data root is not allowlisted")
        valid = True
        return TrustedPupuScope(
            task_id=task_id,
            task_version=task_version,
            allowed_operations=allowed_operations,
            account_id=account_id,
            accounts_root=accounts_root,
            data_root=data_root,
            receiver_id=receiver_id,
            store_id=store_id,
            place_id=place_id,
        )
    finally:
        if not valid:
            source.unlink(missing_ok=True)
