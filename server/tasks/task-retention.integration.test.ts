import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { runTaskRetention } from "./task-retention";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const pool = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;
const activeTaskId = "73000000-0000-4000-8000-000000000001";
const terminalTaskId = "73000000-0000-4000-8000-000000000002";
const staleTaskId = "73000000-0000-4000-8000-000000000003";
const referencedCandidateId = "73000000-0000-4000-8000-000000000004";
const unreferencedCandidateId = "73000000-0000-4000-8000-000000000005";
const planId = "73000000-0000-4000-8000-000000000006";

describeDb("task retention", () => {
  beforeEach(async () => {
    await migrate(pool!, join(process.cwd(), "server/db/migrations"));
    await pool!.query("TRUNCATE tasks CASCADE");
    await pool!.query(
      `INSERT INTO tasks (
        task_id, owner_id, provider_account_id, version,
        domain, goal, phase, request_text, created_at, updated_at, terminal_at
      ) VALUES
        ($1, 'owner-a', 'account-a', 5, 'commerce', 'prepare_cart',
          'awaiting_cart_confirmation', 'active', '2026-07-01', '2026-08-01', NULL),
        ($2, 'owner-a', NULL, 2, 'general', 'advice',
          'completed', 'terminal', '2026-06-01', '2026-07-01', '2026-07-01'),
        ($3, 'owner-a', NULL, 2, 'general', 'advice',
          'advising', 'stale', '2026-04-01', '2026-05-01', NULL)`,
      [activeTaskId, terminalTaskId, staleTaskId],
    );
    await pool!.query(
      `INSERT INTO task_address_bindings (
        task_id, receiver_id, store_id, place_id, place_zip, binding_version
      ) VALUES ($1, 'receiver-a', 'store-a', 'place-a', 350100, 1)`,
      [activeTaskId],
    );
    await pool!.query(
      `INSERT INTO task_runs (
        run_id, task_id, task_version, owner_id,
        allowed_capabilities, status, created_at, completed_at
      ) VALUES (
        'run-retention', $1, 4, 'owner-a',
        '[]'::jsonb, 'completed', '2026-07-01', '2026-07-01'
      )`,
      [activeTaskId],
    );
    await pool!.query(
      `INSERT INTO task_product_candidates (
        candidate_id, task_id, task_version, run_id, tool_call_id,
        store_product_id, name, unit_price_cents, in_stock, collected_at
      ) VALUES
        ($2, $1, 4, 'run-retention', 'call-1',
          'sku-ref', '保留商品', 100, true, '2026-08-01'),
        ($3, $1, 4, 'run-retention', 'call-1',
          'sku-old', '过期候选', 200, true, '2026-08-01')`,
      [activeTaskId, referencedCandidateId, unreferencedCandidateId],
    );
    await pool!.query(
      `INSERT INTO final_plans (
        plan_id, task_id, plan_version, task_version, run_id,
        title, explanation, currency, total_cents, status, created_at
      ) VALUES (
        $2, $1, 1, 5, 'run-retention',
        'plan', 'plan', 'CNY', 100, 'current', '2026-08-01'
      )`,
      [activeTaskId, planId],
    );
    await pool!.query(
      `INSERT INTO final_plan_items (
        plan_id, candidate_id, position, quantity,
        unit_price_cents, line_total_cents
      ) VALUES ($1, $2, 0, 1, 100, 100)`,
      [planId, referencedCandidateId],
    );
    await pool!.query(
      `INSERT INTO task_confirmations (
        confirmation_id, task_id, kind, task_version,
        plan_id, plan_version, binding_version,
        payload_hash, provider_payload, status, expires_at, created_at
      ) VALUES (
        '73000000-0000-4000-8000-000000000007', $1, 'cart', 5,
        $2, 1, 1, 'hash', '{}'::jsonb, 'expired',
        '2026-07-16', '2026-07-16'
      )`,
      [activeTaskId, planId],
    );
    await pool!.query(
      `INSERT INTO idempotency_records (
        account_id, operation, idempotency_key, request_hash,
        task_id, status, result, created_at, updated_at, expires_at
      ) VALUES (
        'account-a', 'cart.commit', 'retained-key', 'hash',
        $1, 'succeeded', '{}'::jsonb,
        '2026-07-16', '2026-07-16', '2026-07-16'
      )`,
      [activeTaskId],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("removes only expired business state beyond the documented windows", async () => {
    const result = await runTaskRetention(
      pool!,
      new Date("2026-08-14T12:00:00.000Z"),
    );

    expect(result).toMatchObject({
      candidatesDeleted: 1,
      tasksDeleted: 2,
      confirmationsDeleted: 0,
      idempotencyDeleted: 0,
    });
    const tasks = await pool!.query(
      "SELECT task_id FROM tasks ORDER BY task_id",
    );
    expect(tasks.rows).toEqual([{ task_id: activeTaskId }]);
    const candidates = await pool!.query(
      "SELECT candidate_id FROM task_product_candidates ORDER BY candidate_id",
    );
    expect(candidates.rows).toEqual([
      { candidate_id: referencedCandidateId },
    ]);
    expect(await pool!.query(
      "SELECT 1 FROM task_confirmations",
    )).toHaveProperty("rowCount", 1);
    expect(await pool!.query(
      "SELECT 1 FROM idempotency_records",
    )).toHaveProperty("rowCount", 1);
  });
});
