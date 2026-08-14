import type { PoolClient } from "pg";

export interface IdempotencyInput {
  accountId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  taskId: string;
  expiresAt: Date;
}

export type IdempotencyAcquireResult =
  | { kind: "acquired" }
  | { kind: "replay"; result: unknown }
  | { kind: "in_progress" };

interface IdempotencyRow {
  request_hash: string;
  status: "running" | "succeeded" | "failed";
  result: unknown;
}

export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class PostgresIdempotencyRepository {
  async acquire(
    client: PoolClient,
    input: IdempotencyInput,
  ): Promise<IdempotencyAcquireResult> {
    const inserted = await client.query(
      `INSERT INTO idempotency_records (
        account_id, operation, idempotency_key, request_hash,
        task_id, status, expires_at
      ) VALUES ($1, $2, $3, $4, $5, 'running', $6)
      ON CONFLICT (account_id, operation, idempotency_key) DO NOTHING`,
      [
        input.accountId,
        input.operation,
        input.idempotencyKey,
        input.requestHash,
        input.taskId,
        input.expiresAt,
      ],
    );
    if (inserted.rowCount === 1) return { kind: "acquired" };

    const existing = await client.query<IdempotencyRow>(
      `SELECT request_hash, status, result
       FROM idempotency_records
       WHERE account_id = $1 AND operation = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [input.accountId, input.operation, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== input.requestHash) {
      throw new IdempotencyConflictError(
        "idempotency key belongs to a different request",
      );
    }
    if (row.status === "succeeded") {
      return { kind: "replay", result: row.result };
    }
    if (row.status === "running") return { kind: "in_progress" };
    throw new IdempotencyConflictError("idempotent operation previously failed");
  }

  async succeed(
    client: PoolClient,
    input: IdempotencyInput,
    result: unknown,
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE idempotency_records SET
        status = 'succeeded',
        result = $5::jsonb,
        error_code = NULL,
        updated_at = now()
       WHERE account_id = $1
         AND operation = $2
         AND idempotency_key = $3
         AND request_hash = $4
         AND status = 'running'`,
      [
        input.accountId,
        input.operation,
        input.idempotencyKey,
        input.requestHash,
        JSON.stringify(result),
      ],
    );
    if (updated.rowCount !== 1) {
      throw new IdempotencyConflictError("idempotent operation cannot succeed");
    }
  }

  async fail(
    client: PoolClient,
    input: IdempotencyInput,
    errorCode: string,
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE idempotency_records SET
        status = 'failed',
        error_code = $5,
        updated_at = now()
       WHERE account_id = $1
         AND operation = $2
         AND idempotency_key = $3
         AND request_hash = $4
         AND status = 'running'`,
      [
        input.accountId,
        input.operation,
        input.idempotencyKey,
        input.requestHash,
        errorCode,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new IdempotencyConflictError("idempotent operation cannot fail");
    }
  }
}
