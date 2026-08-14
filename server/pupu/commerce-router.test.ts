import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryTaskStore } from "../tasks/in-memory-task-store";
import { handlePupuCommerceRequest } from "./commerce-router";

const session = {
  token: "x".repeat(43),
  accountId: "acct_0123456789abcdef0123456789abcdef",
  created: false,
};
const binding = {
  receiverId: "receiver-a",
  storeId: "store-a",
  placeId: "place-a",
  placeZip: 350100,
};
const cartPreview = {
  previewId: "cart-a",
  version: 1,
  items: [],
  totalCents: 0,
};
const checkoutPreview = {
  previewId: "checkout-a",
  version: 1,
  addressHint: "已选择地址",
  lines: [{ name: "牛奶", quantity: 1, priceCents: 1290 }],
  productTotalCents: 1290,
  deliveryFeeCents: 0,
  discountCents: 0,
  payableCents: 1290,
  expiresAt: "2999-01-01T00:00:00.000Z",
};
const deps = {
  sessionStore: { resolve: vi.fn().mockResolvedValue(session) },
  addressController: { getSelection: vi.fn().mockReturnValue(binding) },
  cartController: {
    preview: vi.fn().mockReturnValue(cartPreview),
    commit: vi.fn().mockResolvedValue({
      status: "verified",
      previewId: "cart-a",
      cartItems: [],
    }),
  },
  checkoutController: {
    preview: vi.fn().mockResolvedValue(checkoutPreview),
    create: vi.fn().mockResolvedValue({
      checkoutId: "checkout-a",
      status: "WAITING_PAY",
      payableCents: 1290,
      paymentTarget: "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=a",
    }),
  },
  config: {
    cliPath: "/opt/pupu",
    accountsRoot: "/srv/accounts",
    dataRoot: "/srv/data",
    publicOrigin: "http://localhost:4173",
  },
};

function request(path: string, body: Record<string, unknown>, origin = "http://localhost:4173") {
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

function confirmationTask(taskCoordinator: InMemoryTaskStore) {
  const searching = taskCoordinator.resolve({ input: "帮我找牛奶" });
  return taskCoordinator.attachProducts(searching.taskId, searching.version, [{
    productId: "sku-a",
    name: "牛奶",
    quantity: 1,
    unitPriceCents: 1290,
    source: "pupu_live",
  }]);
}

describe("Pupu commerce router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the cookie-bound selected address", async () => {
    const response = await handlePupuCommerceRequest(
      new Request("http://localhost:4173/api/pupu/cart/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:4173",
        },
        body: JSON.stringify({}),
      }),
      { ...deps, taskCoordinator: new InMemoryTaskStore() } as never,
    );
    expect(response.status).toBe(401);
  });

  it("rejects cart preview before task reaches confirmation", async () => {
    const taskCoordinator = new InMemoryTaskStore({ createId: () => "task-gate-1" });
    const task = taskCoordinator.resolve({ input: "帮我找牛奶" });
    const response = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {
        taskId: task.taskId,
        taskVersion: task.version,
        planId: "run-a",
        items: [{ productId: "sku-a", quantity: 1 }],
      }),
      { ...deps, taskCoordinator } as never,
    );

    expect(response.status).toBe(409);
    expect(deps.cartController.preview).not.toHaveBeenCalled();
  });

  it("advances the full legal cart and order confirmation sequence", async () => {
    const taskCoordinator = new InMemoryTaskStore({ createId: () => "task-flow-1" });
    const task = confirmationTask(taskCoordinator);

    const previewResponse = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {
        taskId: task.taskId,
        taskVersion: task.version,
        planId: "run-a",
        items: [{ productId: "sku-a", quantity: 1 }],
      }),
      { ...deps, taskCoordinator } as never,
    );
    const previewBody = await previewResponse.json();
    expect(previewResponse.status).toBe(200);
    expect(previewBody.task.phase).toBe("awaiting_cart_confirmation");
    expect(previewBody.task.context.cartPreview.id).toBe("cart-a");

    const writingTask = previewBody.task;
    const commitResponse = await handlePupuCommerceRequest(
      request("/api/pupu/cart/commit", {
        taskId: writingTask.taskId,
        taskVersion: writingTask.version,
        previewId: "cart-a",
        version: 1,
        idempotencyKey: "idem-cart-12345678",
      }),
      { ...deps, taskCoordinator } as never,
    );
    const commitBody = await commitResponse.json();
    expect(commitResponse.status).toBe(200);
    expect(commitBody.task.phase).toBe("awaiting_order_confirmation");

    const checkoutResponse = await handlePupuCommerceRequest(
      request("/api/pupu/checkout/preview", {
        taskId: commitBody.task.taskId,
        taskVersion: commitBody.task.version,
      }),
      { ...deps, taskCoordinator } as never,
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(200);
    expect(checkoutBody.task.phase).toBe("awaiting_order_confirmation");
    expect(checkoutBody.task.context.checkoutPreview.id).toBe("checkout-a");

    const creatingTask = checkoutBody.task;
    const orderResponse = await handlePupuCommerceRequest(
      request("/api/pupu/checkout/create-invite-pay", {
        taskId: creatingTask.taskId,
        taskVersion: creatingTask.version,
        previewId: "checkout-a",
        version: 1,
        idempotencyKey: "idem-order-12345678",
      }),
      { ...deps, taskCoordinator } as never,
    );
    const orderBody = await orderResponse.json();
    expect(orderResponse.status).toBe(200);
    expect(orderBody.task.phase).toBe("awaiting_payment");
    expect(deps.cartController.commit).toHaveBeenCalledOnce();
    expect(deps.checkoutController.create).toHaveBeenCalledOnce();
  });

  it("rejects cross-origin mutations", async () => {
    const response = await handlePupuCommerceRequest(
      request("/api/pupu/cart/preview", {}, "https://evil.example"),
      { ...deps, taskCoordinator: new InMemoryTaskStore() } as never,
    );
    expect(response.status).toBe(403);
  });
});
