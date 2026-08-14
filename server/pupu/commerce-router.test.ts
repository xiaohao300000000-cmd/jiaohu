import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { createDatabasePool } from "../db/pool";
import { deterministicCandidateId } from "../tasks/final-plan";
import { TaskApplicationService } from "../tasks/task-application-service";
import { TaskCoordinator } from "../tasks/task-coordinator";
import { PostgresTaskRepository } from "../tasks/task-repository";
import { testProposal } from "../tasks/task-test-helper";
import { PupuCartController } from "./cart-controller";
import { handlePupuCommerceRequest } from "./commerce-router";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const pool = url
  ? createDatabasePool({ url, maxConnections: 4, idleTimeoutMs: 1_000 })
  : null;
const session = {
  token: "x".repeat(43),
  accountId: "acct_0123456789abcdef0123456789abcdef",
  created: false,
};
const ownerId = "owner-router";
const binding = {
  receiverId: "receiver-a",
  storeId: "store-a",
  placeId: "place-a",
  placeZip: 350100,
};
const config = {
  cliPath: "/opt/pupu",
  accountsRoot: "/srv/accounts",
  dataRoot: "/srv/data",
  publicOrigin: "http://localhost:4173",
};
const checkoutPreview = {
  previewId: "checkout-a",
  version: 1,
  addressHint: "已选择地址",
  lines: [{ name: "牛奶", quantity: 2, priceCents: 1290 }],
  productTotalCents: 2580,
  deliveryFeeCents: 0,
  discountCents: 0,
  payableCents: 2580,
  expiresAt: "2999-01-01T00:00:00.000Z",
};

function taskService() {
  return new TaskApplicationService(
    pool!,
    new PostgresTaskRepository(),
    new TaskCoordinator(),
  );
}

async function plannedTask() {
  const app = new TaskApplicationService(
    pool!,
    new PostgresTaskRepository(),
    new TaskCoordinator(),
    () => "72000000-0000-4000-8000-000000000001",
  );
  const created = await app.resolve({
    ownerId,
    input: "买两盒牛奶",
    proposal: testProposal("买两盒牛奶"),
  });
  const bound = await app.bindAddress({
    ownerId,
    taskId: created.taskId,
    expectedVersion: created.version,
    providerAccountId: session.accountId,
    binding,
  });
  await app.startRun({
    ownerId,
    taskId: bound.taskId,
    taskVersion: bound.version,
    runId: "run-router",
  });
  const candidateId = deterministicCandidateId(
    bound.taskId,
    bound.version,
    "run-router",
    "milk-a",
  );
  await app.storeCandidates({
    ownerId,
    taskId: bound.taskId,
    taskVersion: bound.version,
    runId: "run-router",
    toolCallId: "call-router",
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
    runId: "run-router",
    mode: "search",
    input: {
      title: "牛奶补货",
      explanation: "两盒",
      items: [{ candidateId, quantity: 2 }],
    },
  });
}

function request(
  path: string,
  body: Record<string, unknown>,
  origin = "http://localhost:4173",
) {
  return new Request(`http://localhost:4173${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: `pupu_session=${session.token}`,
    },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const cartController = {
    preview: vi.fn((task, selectedBinding) =>
      new PupuCartController().preview(task, selectedBinding)),
    commit: vi.fn(async (_scope, _binding, _actor, confirmationId) => ({
      status: "verified",
      confirmationId,
      cartItems: [],
    })),
  };
  const checkoutController = {
    preview: vi.fn().mockResolvedValue(checkoutPreview),
    create: vi.fn().mockResolvedValue({
      checkoutId: "checkout-a",
      status: "WAITING_PAY",
      payableCents: 2580,
      paymentTarget:
        "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=a",
    }),
  };
  return {
    sessionStore: { resolve: vi.fn().mockResolvedValue(session) },
    taskService: taskService(),
    ownerId,
    cartController,
    checkoutController,
    config,
    ...overrides,
  };
}

describeDb("Pupu commerce router", () => {
  beforeEach(async () => {
    await migrate(pool!, join(process.cwd(), "server/db/migrations"));
    await pool!.query("TRUNCATE tasks CASCADE");
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects missing sessions and cross-origin requests", async () => {
    const deps = dependencies();
    const noCookie = await handlePupuCommerceRequest(
      new Request("http://localhost:4173/api/pupu/cart/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: config.publicOrigin,
        },
        body: JSON.stringify({}),
      }),
      deps as never,
    );
    const crossOrigin = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {}, "https://evil.example"),
      deps as never,
    );

    expect(noCookie.status).toBe(401);
    expect(crossOrigin.status).toBe(403);
  });

  it("rejects client-supplied products, plans, prices, and addresses", async () => {
    const task = await plannedTask();
    const deps = dependencies();
    const response = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {
        taskId: task.taskId,
        taskVersion: task.version,
        planId: task.finalPlan?.planId,
        items: [{ productId: "attacker-product", quantity: 20, price: 1 }],
        address: { receiverId: "attacker" },
      }),
      deps as never,
    );

    expect(response.status).toBe(400);
    expect(deps.cartController.preview).not.toHaveBeenCalled();
  });

  it("persists the full cart and order confirmation sequence", async () => {
    const planned = await plannedTask();
    const deps = dependencies();

    const previewResponse = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {
        taskId: planned.taskId,
        taskVersion: planned.version,
      }),
      deps as never,
    );
    const preview = await previewResponse.json();
    expect(previewResponse.status).toBe(200);
    expect(preview).toMatchObject({
      confirmationId: expect.any(String),
      totalCents: 2580,
      task: {
        phase: "awaiting_cart_confirmation",
        context: { cartPreview: { id: expect.any(String) } },
      },
    });

    const commitRequest = {
      taskId: planned.taskId,
      taskVersion: preview.task.version,
      confirmationId: preview.confirmationId,
      idempotencyKey: "cart-router-durable",
    };
    const commitResponse = await handlePupuCommerceRequest(
      request("/api/pupu/cart/commit", commitRequest),
      { ...deps, taskService: taskService() } as never,
    );
    const committed = await commitResponse.json();
    expect(commitResponse.status).toBe(200);
    expect(committed.task.phase).toBe("awaiting_order_confirmation");

    const checkoutResponse = await handlePupuCommerceRequest(
      request("/api/pupu/checkout/preview", {
        taskId: planned.taskId,
        taskVersion: committed.task.version,
      }),
      { ...deps, taskService: taskService() } as never,
    );
    const checkout = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(200);
    expect(checkout).toMatchObject({
      confirmationId: expect.any(String),
      payableCents: 2580,
      task: {
        phase: "awaiting_order_confirmation",
        context: { checkoutPreview: { id: expect.any(String) } },
      },
    });
    expect(checkout).not.toHaveProperty("previewId");
    expect(checkout).not.toHaveProperty("version");

    const orderResponse = await handlePupuCommerceRequest(
      request("/api/pupu/checkout/create-invite-pay", {
        taskId: planned.taskId,
        taskVersion: checkout.task.version,
        confirmationId: checkout.confirmationId,
        idempotencyKey: "order-router-durable",
      }),
      { ...deps, taskService: taskService() } as never,
    );
    const order = await orderResponse.json();
    expect(orderResponse.status).toBe(200);
    expect(order.task.phase).toBe("awaiting_payment");
    expect(deps.cartController.commit).toHaveBeenCalledOnce();
    expect(deps.checkoutController.create).toHaveBeenCalledOnce();

    const replayResponse = await handlePupuCommerceRequest(
      request("/api/pupu/cart/commit", commitRequest),
      { ...deps, taskService: taskService() } as never,
    );
    await expect(replayResponse.json()).resolves.toEqual(committed);
    expect(deps.cartController.commit).toHaveBeenCalledOnce();
  });

  it("allows one fake-provider invocation when two instances race one key", async () => {
    const planned = await plannedTask();
    let release!: (value: unknown) => void;
    const commit = vi.fn(() => new Promise((resolve) => {
      release = resolve;
    }));
    const deps = dependencies({
      cartController: {
        preview: vi.fn((task, selectedBinding) =>
          new PupuCartController().preview(task, selectedBinding)),
        commit,
      },
    });
    const previewResponse = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {
        taskId: planned.taskId,
        taskVersion: planned.version,
      }),
      deps as never,
    );
    const preview = await previewResponse.json();
    const body = {
      taskId: planned.taskId,
      taskVersion: preview.task.version,
      confirmationId: preview.confirmationId,
      idempotencyKey: "cart-router-race",
    };

    const first = handlePupuCommerceRequest(
      request("/api/pupu/cart/commit", body),
      { ...deps, taskService: taskService() } as never,
    );
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());
    const second = await handlePupuCommerceRequest(
      request("/api/pupu/cart/commit", body),
      { ...deps, taskService: taskService() } as never,
    );
    expect(second.status).toBe(409);
    release({
      status: "verified",
      confirmationId: preview.confirmationId,
      cartItems: [],
    });
    expect((await first).status).toBe(200);
    expect(commit).toHaveBeenCalledOnce();
  });
});
