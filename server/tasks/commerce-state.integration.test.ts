import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { PupuCartController } from "../pupu/cart-controller";
import { deterministicCandidateId } from "./final-plan";
import { TaskApplicationService } from "./task-application-service";
import { TaskConflictError, TaskCoordinator } from "./task-coordinator";
import { PostgresTaskRepository } from "./task-repository";
import { testProposal } from "./task-test-helper";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const pool = url
  ? createDatabasePool({ url, maxConnections: 4, idleTimeoutMs: 1_000 })
  : null;
const ownerId = "owner-commerce";
const accountId = "acct_0123456789abcdef0123456789abcdef";
const binding = {
  receiverId: "receiver-a",
  storeId: "store-a",
  placeId: "place-a",
  placeZip: 350100,
};

function service() {
  return new TaskApplicationService(
    pool!,
    new PostgresTaskRepository(),
    new TaskCoordinator(),
    () => "71000000-0000-4000-8000-000000000001",
  );
}

async function plannedTask() {
  const app = service();
  const created = await app.resolve({
    ownerId,
    input: "买两盒牛奶",
    proposal: testProposal("买两盒牛奶"),
  });
  const bound = await app.bindAddress({
    ownerId,
    taskId: created.taskId,
    expectedVersion: created.version,
    providerAccountId: accountId,
    binding,
  });
  await app.startRun({
    ownerId,
    taskId: bound.taskId,
    taskVersion: bound.version,
    runId: "run-commerce",
  });
  const candidateId = deterministicCandidateId(
    bound.taskId,
    bound.version,
    "run-commerce",
    "milk-a",
  );
  await app.storeCandidates({
    ownerId,
    taskId: bound.taskId,
    taskVersion: bound.version,
    runId: "run-commerce",
    toolCallId: "call-commerce",
    candidates: [{
      candidateId,
      storeProductId: "milk-a",
      providerProductId: "provider-milk-a",
      name: "鲜牛奶",
      unitPriceCents: 1290,
      inStock: true,
      collectedAt: "2026-08-14T00:00:00.000Z",
    }],
  });
  return app.submitFinalPlan({
    ownerId,
    taskId: bound.taskId,
    expectedVersion: bound.version,
    runId: "run-commerce",
    mode: "search",
    input: {
      title: "牛奶补货",
      explanation: "两盒",
      items: [{ candidateId, quantity: 2 }],
    },
  });
}

describeDb("durable commerce state", () => {
  beforeEach(async () => {
    await migrate(pool!, join(process.cwd(), "server/db/migrations"));
    await pool!.query("TRUNCATE tasks CASCADE");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists a task-bound cart confirmation across service recreation", async () => {
    const planned = await plannedTask();
    const payload = new PupuCartController().preview(planned, binding);

    const prepared = await service().createConfirmation({
      ownerId,
      providerAccountId: accountId,
      taskId: planned.taskId,
      expectedVersion: planned.version,
      kind: "cart",
      payload,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    });

    expect(prepared.task.version).toBe(planned.version + 1);
    expect(prepared.task.context.cartPreview).toMatchObject({
      id: prepared.confirmationId,
      version: prepared.task.version,
    });
    await expect(service().get(ownerId, planned.taskId)).resolves.toEqual(
      prepared.task,
    );
    await expect(service().createConfirmation({
      ownerId,
      providerAccountId: accountId,
      taskId: planned.taskId,
      expectedVersion: planned.version,
      kind: "cart",
      payload,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    })).rejects.toBeInstanceOf(TaskConflictError);
  });

  it("consumes one durable confirmation and replays one durable mutation result", async () => {
    const planned = await plannedTask();
    const payload = new PupuCartController().preview(planned, binding);
    const prepared = await service().createConfirmation({
      ownerId,
      providerAccountId: accountId,
      taskId: planned.taskId,
      expectedVersion: planned.version,
      kind: "cart",
      payload,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    });
    const command = {
      ownerId,
      providerAccountId: accountId,
      operation: "cart.commit",
      kind: "cart" as const,
      taskId: planned.taskId,
      expectedVersion: prepared.task.version,
      confirmationId: prepared.confirmationId,
      idempotencyKey: "cart-durable-key",
      enterPhase: "writing_cart" as const,
    };

    const acquired = await service().acquireMutation(command);
    expect(acquired).toMatchObject({
      kind: "acquired",
      payload,
      task: { phase: "writing_cart" },
    });
    await expect(service().acquireMutation(command)).resolves.toEqual({
      kind: "in_progress",
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquisition");

    const completed = await service().completeMutation({
      ...command,
      expectedCurrentVersion: acquired.task.version,
      nextPhase: "awaiting_order_confirmation",
      providerResult: {
        status: "verified",
        confirmationId: prepared.confirmationId,
        cartItems: [],
      },
    });
    expect(completed).toMatchObject({
      status: "verified",
      task: { phase: "awaiting_order_confirmation" },
    });
    await expect(service().acquireMutation(command)).resolves.toEqual({
      kind: "replay",
      result: completed,
    });
  });

  it("requires the owner, provider account, version, and phase together", async () => {
    const planned = await plannedTask();

    await expect(service().requirePhase({
      ownerId,
      providerAccountId: accountId,
      taskId: planned.taskId,
      expectedVersion: planned.version,
      phase: "awaiting_cart_confirmation",
    })).resolves.toEqual(planned);
    await expect(service().requirePhase({
      ownerId,
      providerAccountId: "account-wrong",
      taskId: planned.taskId,
      expectedVersion: planned.version,
      phase: "awaiting_cart_confirmation",
    })).rejects.toBeInstanceOf(TaskConflictError);
  });

});
