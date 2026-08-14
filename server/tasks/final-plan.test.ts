import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { TaskApplicationService } from "./task-application-service";
import { TaskCoordinator, TaskConflictError } from "./task-coordinator";
import {
  deterministicCandidateId,
  submitFinalPlanSchema,
} from "./final-plan";
import { testProposal } from "./task-test-helper";
import { PostgresTaskRepository } from "./task-repository";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const pool = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;

describe("submitFinalPlanSchema", () => {
  it("rejects duplicate candidates and unknown fields", () => {
    const candidateId = "10000000-0000-4000-8000-000000000001";
    expect(submitFinalPlanSchema.safeParse({
      title: "plan",
      explanation: "why",
      items: [
        { candidateId, quantity: 1 },
        { candidateId, quantity: 2 },
      ],
    }).success).toBe(false);
    expect(submitFinalPlanSchema.safeParse({
      title: "plan",
      explanation: "why",
      items: [{ candidateId, quantity: 1, price: 1 }],
    }).success).toBe(false);
  });
});

describeDb("authoritative FinalPlan", () => {
  beforeEach(async () => {
    await migrate(pool!, join(process.cwd(), "server/db/migrations"));
    await pool!.query("TRUNCATE tasks CASCADE");
  });
  afterAll(async () => pool?.end());

  it("stores candidates without selecting them, then submits one priced plan", async () => {
    const service = new TaskApplicationService(
      pool!,
      new PostgresTaskRepository(),
      new TaskCoordinator(),
      () => "50000000-0000-4000-8000-000000000001",
    );
    const task = await service.resolve({ ownerId: "owner-a", input: "买牛奶", proposal: testProposal("买牛奶") });
    await service.startRun({
      ownerId: "owner-a",
      taskId: task.taskId,
      taskVersion: task.version,
      runId: "run-plan-1",
    });
    const firstId = deterministicCandidateId(
      task.taskId, task.version, "run-plan-1", "sku-a",
    );
    const secondId = deterministicCandidateId(
      task.taskId, task.version, "run-plan-1", "sku-b",
    );
    const afterCandidates = await service.storeCandidates({
      ownerId: "owner-a",
      taskId: task.taskId,
      taskVersion: task.version,
      runId: "run-plan-1",
      toolCallId: "call-1",
      candidates: [
        {
          candidateId: firstId,
          storeProductId: "sku-a",
          providerProductId: "provider-a",
          name: "鲜牛奶",
          specification: "950ml",
          unitPriceCents: 1290,
          inStock: true,
          collectedAt: "2026-08-14T00:00:00.000Z",
        },
        {
          candidateId: secondId,
          storeProductId: "sku-b",
          name: "缺货牛奶",
          unitPriceCents: 990,
          inStock: false,
          collectedAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });
    expect(afterCandidates.context.selectedProducts).toEqual([]);
    expect(afterCandidates.finalPlan).toBeUndefined();

    await expect(service.submitFinalPlan({
      ownerId: "owner-a",
      taskId: task.taskId,
      expectedVersion: task.version,
      runId: "run-plan-1",
      mode: "search",
      input: {
        title: "bad",
        explanation: "out of stock",
        items: [{ candidateId: secondId, quantity: 1 }],
      },
    })).rejects.toBeInstanceOf(TaskConflictError);

    const planned = await service.submitFinalPlan({
      ownerId: "owner-a",
      taskId: task.taskId,
      expectedVersion: task.version,
      runId: "run-plan-1",
      mode: "search",
      input: {
        title: "牛奶方案",
        explanation: "一瓶",
        items: [{ candidateId: firstId, quantity: 2 }],
      },
    });
    expect(planned.version).toBe(task.version + 1);
    expect(planned.phase).toBe("awaiting_cart_confirmation");
    expect(planned.finalPlan).toMatchObject({
      title: "牛奶方案",
      totalCents: 2580,
      version: 1,
    });
    expect(planned.context.selectedProducts).toEqual([{
      productId: "sku-a",
      providerProductId: "provider-a",
      name: "鲜牛奶",
      quantity: 2,
      unitPriceCents: 1290,
      source: "pupu_live",
    }]);
  });
});
