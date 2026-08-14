import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import {
  IdempotencyConflictError,
  PostgresIdempotencyRepository,
} from "./idempotency-repository";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const poolA = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;
const poolB = url
  ? createDatabasePool({ url, maxConnections: 2, idleTimeoutMs: 1_000 })
  : null;
const taskId = "70000000-0000-4000-8000-000000000001";

describeDb("PostgresIdempotencyRepository", () => {
  beforeEach(async () => {
    await migrate(poolA!, join(process.cwd(), "server/db/migrations"));
    await poolA!.query("TRUNCATE tasks CASCADE");
    await poolA!.query(
      `INSERT INTO tasks (
        task_id, owner_id, provider_account_id, version,
        domain, goal, phase, request_text
      ) VALUES ($1, 'owner-a', 'account-a', 8,
        'commerce', 'prepare_cart', 'writing_cart', 'buy milk')`,
      [taskId],
    );
  });

  afterAll(async () => {
    await poolA?.end();
    await poolB?.end();
  });

  it("allows one executor across two pools and replays its durable result", async () => {
    const repositoryA = new PostgresIdempotencyRepository();
    const repositoryB = new PostgresIdempotencyRepository();
    const input = {
      accountId: "account-a",
      operation: "cart.commit",
      idempotencyKey: "cart-one-executor",
      requestHash: "hash-a",
      taskId,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    };

    const [first, second] = await Promise.all([
      withTransaction(poolA!, (client) => repositoryA.acquire(client, input)),
      withTransaction(poolB!, (client) => repositoryB.acquire(client, input)),
    ]);

    expect([first.kind, second.kind].sort()).toEqual([
      "acquired",
      "in_progress",
    ]);

    await withTransaction(poolA!, (client) =>
      repositoryA.succeed(client, input, {
        status: "verified",
        task: { taskId, version: 9 },
      }));

    await expect(withTransaction(poolB!, (client) =>
      repositoryB.acquire(client, input),
    )).resolves.toEqual({
      kind: "replay",
      result: {
        status: "verified",
        task: { taskId, version: 9 },
      },
    });
  });

  it("rejects reuse of a key for a different request", async () => {
    const repository = new PostgresIdempotencyRepository();
    const input = {
      accountId: "account-a",
      operation: "order.create",
      idempotencyKey: "order-same-key",
      requestHash: "hash-a",
      taskId,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    };
    await withTransaction(poolA!, (client) => repository.acquire(client, input));

    await expect(withTransaction(poolB!, (client) =>
      repository.acquire(client, { ...input, requestHash: "hash-b" }),
    )).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
