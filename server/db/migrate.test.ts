import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { join } from "node:path";
import { migrate } from "./migrate";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must identify the isolated test database");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
});
const migrationsRoot = join(process.cwd(), "server/db/migrations");

describe("database migrations", () => {
  beforeAll(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies the task-state schema idempotently", async () => {
    await migrate(pool, migrationsRoot);
    await migrate(pool, migrationsRoot);

    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name <> 'schema_migrations'
        ORDER BY table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "final_plan_items",
      "final_plans",
      "idempotency_records",
      "task_address_bindings",
      "task_confirmations",
      "task_product_candidates",
      "task_runs",
      "tasks",
    ]);
    const applied = await pool.query(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(applied.rows).toEqual([{ version: "001_task_state.sql" }]);
  });

  it("allows only one current FinalPlan per task", async () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    await pool.query(
      `INSERT INTO tasks (
         task_id, owner_id, version, domain, goal, phase, request_text
       ) VALUES ($1, 'owner-test', 1, 'commerce', 'find_products',
         'searching_catalog', 'test')`,
      [taskId],
    );
    await pool.query(
      `INSERT INTO task_runs (
         run_id, task_id, task_version, owner_id,
         allowed_capabilities, status
       ) VALUES (
         'run-1', $1, 1, 'owner-test',
         '["commerce.catalog.search","task.plan.submit"]'::jsonb,
         'completed'
       )`,
      [taskId],
    );
    await pool.query(
      `INSERT INTO final_plans (
         plan_id, task_id, plan_version, task_version, run_id,
         title, explanation, currency, total_cents, status
       ) VALUES (
         '22222222-2222-4222-8222-222222222222', $1, 1, 1,
         'run-1', 'first', 'first', 'CNY', 100, 'current'
       )`,
      [taskId],
    );

    await expect(pool.query(
      `INSERT INTO final_plans (
         plan_id, task_id, plan_version, task_version, run_id,
         title, explanation, currency, total_cents, status
       ) VALUES (
         '33333333-3333-4333-8333-333333333333', $1, 2, 1,
         'run-1', 'second', 'second', 'CNY', 100, 'current'
       )`,
      [taskId],
    )).rejects.toMatchObject({ code: "23505" });
  });
});
