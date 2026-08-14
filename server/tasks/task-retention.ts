import type { Pool } from "pg";
import { withTransaction } from "../db/transaction";

export interface RetentionResult {
  candidatesDeleted: number;
  confirmationsDeleted: number;
  idempotencyDeleted: number;
  tasksDeleted: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const BATCH_SIZE = 1_000;

export function runTaskRetention(
  pool: Pool,
  now = new Date(),
): Promise<RetentionResult> {
  const candidateCutoff = new Date(now.getTime() - 7 * DAY_MS);
  const businessCutoff = new Date(now.getTime() - 30 * DAY_MS);
  const staleTaskCutoff = new Date(now.getTime() - 90 * DAY_MS);

  return withTransaction(pool, async (client) => {
    const candidates = await client.query(
      `WITH doomed AS (
        SELECT c.candidate_id
        FROM task_product_candidates c
        WHERE c.collected_at < $1
          AND NOT EXISTS (
            SELECT 1 FROM final_plan_items i
            WHERE i.candidate_id = c.candidate_id
          )
        ORDER BY c.collected_at
        LIMIT $2
      )
      DELETE FROM task_product_candidates c
      USING doomed
      WHERE c.candidate_id = doomed.candidate_id`,
      [candidateCutoff, BATCH_SIZE],
    );

    const confirmations = await client.query(
      `WITH doomed AS (
        SELECT confirmation_id
        FROM task_confirmations
        WHERE created_at < $1
          AND (status <> 'active' OR expires_at <= $2)
        ORDER BY created_at
        LIMIT $3
      )
      DELETE FROM task_confirmations c
      USING doomed
      WHERE c.confirmation_id = doomed.confirmation_id`,
      [businessCutoff, now, BATCH_SIZE],
    );

    const idempotency = await client.query(
      `WITH doomed AS (
        SELECT account_id, operation, idempotency_key
        FROM idempotency_records
        WHERE updated_at < $1
          AND expires_at <= $2
        ORDER BY updated_at
        LIMIT $3
      )
      DELETE FROM idempotency_records i
      USING doomed
      WHERE i.account_id = doomed.account_id
        AND i.operation = doomed.operation
        AND i.idempotency_key = doomed.idempotency_key`,
      [businessCutoff, now, BATCH_SIZE],
    );

    const tasks = await client.query(
      `WITH doomed AS (
        SELECT task_id
        FROM tasks
        WHERE (
          phase = 'completed'
          AND COALESCE(terminal_at, updated_at) < $1
        ) OR (
          phase <> 'completed'
          AND updated_at < $2
        )
        ORDER BY updated_at
        LIMIT $3
      )
      DELETE FROM tasks t
      USING doomed
      WHERE t.task_id = doomed.task_id`,
      [businessCutoff, staleTaskCutoff, BATCH_SIZE],
    );

    return {
      candidatesDeleted: candidates.rowCount ?? 0,
      confirmationsDeleted: confirmations.rowCount ?? 0,
      idempotencyDeleted: idempotency.rowCount ?? 0,
      tasksDeleted: tasks.rowCount ?? 0,
    };
  });
}
