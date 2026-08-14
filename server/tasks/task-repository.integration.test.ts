import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabasePool } from "../db/pool";
import { join } from "node:path";
import { migrate } from "../db/migrate";
import { withTransaction } from "../db/transaction";
import { TaskCoordinator, TaskConflictError } from "./task-coordinator";
import { testProposal } from "./task-test-helper";
import {
  PostgresTaskRepository,
  TaskNotFoundError,
} from "./task-repository";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const poolA = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;
const poolB = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;

describeDb("PostgresTaskRepository", () => {
  beforeEach(async () => {
    await migrate(poolA!, join(process.cwd(), "server/db/migrations"));
    await poolA!.query("TRUNCATE tasks CASCADE");
  });

  afterAll(async () => {
    await poolA?.end();
    await poolB?.end();
  });

  it("survives a repository and pool boundary", async () => {
    const rules = new TaskCoordinator();
    const initial = rules.acceptNewTask(
      "10000000-0000-4000-8000-000000000001",
      "4个人低脂晚餐，预算150元",
      testProposal("4个人低脂晚餐，预算150元"),
    ).next;
    const repositoryA = new PostgresTaskRepository();

    const created = await withTransaction(poolA!, (client) =>
      repositoryA.create(client, "owner-a", initial));

    const loaded = await withTransaction(poolB!, (client) =>
      new PostgresTaskRepository().loadSnapshot(
        client,
        "owner-a",
        created.taskId,
      ));

    expect(loaded).toEqual(created);
  });

  it("allows only one compare-and-swap write", async () => {
    const rules = new TaskCoordinator();
    const repository = new PostgresTaskRepository();
    const initial = rules.acceptNewTask(
      "10000000-0000-4000-8000-000000000002",
      "买牛奶",
      testProposal("买牛奶"),
    ).next;
    const created = await withTransaction(poolA!, (client) =>
      repository.create(client, "owner-a", initial));
    const decisionA = rules.acceptProposal(created, "预算改成50元", testProposal("预算改成50元", created));
    const decisionB = rules.acceptProposal(created, "预算改成60元", testProposal("预算改成60元", created));

    const outcomes = await Promise.allSettled([
      withTransaction(poolA!, (client) =>
        repository.applyDecision(
          client,
          "owner-a",
          created.version,
          decisionA,
        )),
      withTransaction(poolB!, (client) =>
        repository.applyDecision(
          client,
          "owner-a",
          created.version,
          decisionB,
        )),
    ]);

    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((item) => item.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(TaskConflictError),
    });
  });

  it("does not reveal another owner's task", async () => {
    const initial = new TaskCoordinator().acceptNewTask(
      "10000000-0000-4000-8000-000000000003",
      "买牛奶",
      testProposal("买牛奶"),
    ).next;
    const repository = new PostgresTaskRepository();
    await withTransaction(poolA!, (client) =>
      repository.create(client, "owner-a", initial));

    await expect(withTransaction(poolA!, (client) =>
      repository.loadSnapshot(client, "owner-b", initial.taskId),
    )).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});
