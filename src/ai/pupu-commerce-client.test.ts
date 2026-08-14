import { describe, expect, it, vi } from "vitest";
import { createPupuCommerceClient } from "./pupu-commerce-client";

const task = {
  taskId: "task-client-1",
  version: 7,
} as const;

describe("createPupuCommerceClient", () => {
  it("sends identity-only preview and confirmation requests", async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({
        path: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        confirmationId: "confirmation-a",
        totalCents: 1290,
        task: { ...task, version: 8 },
        status: "verified",
        addressHint: "地址",
        lines: [],
        productTotalCents: 1290,
        deliveryFeeCents: 0,
        discountCents: 0,
        payableCents: 1290,
        expiresAt: "2999-01-01T00:00:00.000Z",
        checkoutId: "checkout-a",
        paymentTarget: "https://pupumall.com",
      });
    });
    const client = createPupuCommerceClient(fetcher);

    await client.previewCart(task);
    await client.commitCart(task, "cart-confirmation");
    await client.previewCheckout(task);
    await client.createInvitePay(task, "checkout-confirmation");

    expect(requests).toHaveLength(4);
    expect(requests.map((request) => request.path)).toEqual([
      "/api/pupu/cart/preview",
      "/api/pupu/cart/commit",
      "/api/pupu/checkout/preview",
      "/api/pupu/checkout/create-invite-pay",
    ]);
    expect(requests[0].body).toEqual({
      taskId: task.taskId,
      taskVersion: task.version,
    });
    expect(requests[1].body).toMatchObject({
      taskId: task.taskId,
      taskVersion: task.version,
      confirmationId: "cart-confirmation",
      idempotencyKey: expect.stringMatching(/^cart-/),
    });
    expect(requests[2].body).toEqual({
      taskId: task.taskId,
      taskVersion: task.version,
    });
    expect(requests[3].body).toMatchObject({
      taskId: task.taskId,
      taskVersion: task.version,
      confirmationId: "checkout-confirmation",
      idempotencyKey: expect.stringMatching(/^order-/),
    });
    for (const request of requests) {
      expect(request.body).not.toHaveProperty("items");
      expect(request.body).not.toHaveProperty("planId");
      expect(request.body).not.toHaveProperty("previewId");
      expect(request.body).not.toHaveProperty("version");
      expect(request.body).not.toHaveProperty("address");
    }
  });
});
