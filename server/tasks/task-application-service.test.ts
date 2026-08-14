import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { TaskApplicationService } from "./task-application-service";
import { TaskCoordinator } from "./task-coordinator";
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
    });
    const changed = await service.resolve({
      ownerId: "owner-a",
      taskId: created.taskId,
      input: "预算改成120元",
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
    const created = await service.resolve({ ownerId: "owner-a", input: "买牛奶" });

    await expect(service.get("owner-b", created.taskId))
      .rejects.toBeInstanceOf(TaskNotFoundError);
  });
});
