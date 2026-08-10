from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CliError(BaseModel):
    model_config = ConfigDict(extra="allow")

    code: str
    message: str
    retryable: bool = False
    details: dict[str, Any] | None = None


class NormalizedSku(BaseModel):
    model_config = ConfigDict(extra="allow")

    store_product_id: str
    product_id: str
    name: str
    price_cents: int = Field(ge=0)
    origin_price_cents: int | None = Field(default=None, ge=0)
    unit: str | None = None
    in_stock: bool
    tags: list[str] = Field(default_factory=list)
    nutrition: dict[str, Any] | None = None


class CliEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    schema_version: str
    ok: bool
    operation: str
    request_id: str
    household_id: str | None
    status: str
    data: Any = None
    error: CliError | None = None
    next_actions: list[str] = Field(default_factory=list)
    evidence_ref: str | None = None
