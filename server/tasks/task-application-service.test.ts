import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { TaskApplicationService } from "./task-application-service";
import { TaskConflictError, TaskCoordinator } from "./task-coordinator";
import { testProposal } from "./task-test-helper";
import { PostgresTaskRepository, TaskNotFoundError } from "./task-repository";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const pool = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;

describeDb("TaskApplicationService", () => {
  beforeEach(async () => {
    await migrate(pool!, join(process.cwd(), "server/db/migrations"));
    await pool!.query("TRUNCATE tasks CASCADE");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates, continues, and reads the authoritative snapshot", async () => {
    const service = new TaskApplicationService(
      pool!,
      new PostgresTaskRepository(),
      new TaskCoordinator(),
      () => "20000000-0000-4000-8000-000000000001",
    );

    const created = await service.resolve({
      ownerId: "owner-a",
      input: "4个人低脂晚餐，预算150元",
      proposal: testProposal("4个人低脂晚餐，预算150元"),
    });
    const changed = await service.resolve({
      ownerId: "owner-a",
      taskId: created.taskId,
      input: "预算改成120元",
      proposal: testProposal("预算改成120元", created),
    });
    const loaded = await service.get("owner-a", created.taskId);

    expect(changed.version).toBe(2);
    expect(changed.context).toMatchObject({
      peopleCount: 4,
      budgetCents: 12_000,
      dietaryRequirements: ["低脂"],
    });
    expect(loaded).toEqual(changed);
  });

  it("keeps owner isolation at the service boundary", async () => {
    const service = new TaskApplicationService(
      pool!,
      new PostgresTaskRepository(),
      new TaskCoordinator(),
    );
    const created = await service.resolve({ ownerId: "owner-a", input: "买牛奶", proposal: testProposal("买牛奶") });

    await expect(service.get("owner-b", created.taskId))
      .rejects.toBeInstanceOf(TaskNotFoundError);
  });
  it("persists address binding and locks it to the provider account", async () => {
    const service = new TaskApplicationService(
      pool!,
      new PostgresTaskRepository(),
      new TaskCoordinator(),
      () => "20000000-0000-4000-8000-000000000002",
    );
    const created = await service.resolve({
      ownerId: "owner-a",
      input: "买牛奶",
      proposal: testProposal("买牛奶"),
    });
    const bound = await service.bindAddress({
      ownerId: "owner-a",
      taskId: created.taskId,
      expectedVersion: created.version,
      providerAccountId: "account-a",
      binding: {
        receiverId: "receiver-a",
        storeId: "store-a",
        placeId: "place-a",
        placeZip: 350100,
      },
    });
    const restarted = new TaskApplicationService(
      pool!,
      new PostgresTaskRepository(),
      new TaskCoordinator(),
    );

    expect(bound.version).toBe(2);
    expect(await restarted.get("owner-a", created.taskId)).toEqual(bound);
    expect(bound.context.addressBinding).toEqual({
      receiverId: "receiver-a",
      storeId: "store-a",
      placeId: "place-a",
      placeZip: 350100,
    });
    await pool!.query(
      `INSERT INTO task_runs (
        run_id, task_id, task_version, owner_id,
        allowed_capabilities, status
      ) VALUES ('run-address', $1, 2, 'owner-a', '[]'::jsonb, 'completed')`,
      [created.taskId],
    );
    await pool!.query(
      `INSERT INTO final_plans (
        plan_id, task_id, plan_version, task_version, run_id,
        title, explanation, currency, total_cents, status
      ) VALUES (
        '30000000-0000-4000-8000-000000000001', $1, 1, 2,
        'run-address', 'plan', 'plan', 'CNY', 100, 'current'
      )`,
      [created.taskId],
    );
    await pool!.query(
      `INSERT INTO task_confirmations (
        confirmation_id, task_id, kind, task_version, plan_id,
        plan_version, binding_version, payload_hash, provider_payload,
        status, expires_at
      ) VALUES (
        '40000000-0000-4000-8000-000000000001', $1, 'cart', 2,
        '30000000-0000-4000-8000-000000000001', 1, 1, 'hash',
        '{}'::jsonb, 'active', now() + interval '5 minutes'
      )`,
      [created.taskId],
    );
    const rebound = await service.bindAddress({
      ownerId: "owner-a",
      taskId: created.taskId,
      expectedVersion: bound.version,
      providerAccountId: "account-a",
      binding: {
        receiverId: "receiver-next",
        storeId: "store-next",
        placeId: "place-next",
        placeZip: 350102,
      },
    });
    const invalidated = await pool!.query(
      `SELECT
        (SELECT status FROM final_plans WHERE task_id = $1) AS plan_status,
        (SELECT status FROM task_confirmations WHERE task_id = $1) AS confirmation_status`,
      [created.taskId],
    );
    expect(invalidated.rows[0]).toEqual({
      plan_status: "invalidated",
      confirmation_status: "invalidated",
    });
    await expect(service.bindAddress({
      ownerId: "owner-a",
      taskId: created.taskId,
      expectedVersion: rebound.version,
      providerAccountId: "account-b",
      binding: {
        receiverId: "receiver-b",
        storeId: "store-b",
        placeId: "place-b",
      },
    })).rejects.toBeInstanceOf(TaskConflictError);
  });


  it("records terminal time when a task completes", async () => {
    const app = new TaskApplicationService(
      pool!,
      new PostgresTaskRepository(),
      new TaskCoordinator(),
      () => "20000000-0000-4000-8000-000000000004",
    );
    const created = await app.resolve({
      ownerId: "owner-a",
      input: "写一句问候",
      proposal: testProposal("写一句问候"),
    });
    await app.transition({
      ownerId: "owner-a",
      taskId: created.taskId,
      expectedVersion: created.version,
      phase: "completed",
    });

    const row = await pool!.query(
      "SELECT terminal_at FROM tasks WHERE task_id = $1",
      [created.taskId],
    );
    expect(row.rows[0].terminal_at).toBeInstanceOf(Date);
  });

});
