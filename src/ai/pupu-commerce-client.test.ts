import { describe, expect, it, vi } from "vitest";
import { createPupuCommerceClient } from "./pupu-commerce-client";

const task = {
  taskId: "task-client-1",
  version: 7,
} as const;

describe("createPupuCommerceClient", () => {
  it("sends the task identity with every commerce operation", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        previewId: "preview-a",
        version: 1,
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

    await client.previewCart(task, "run-a", [{
      productId: "sku-a",
      name: "牛奶",
      specification: "950ml",
      unitPrice: 12.9,
      quantity: 1,
      currency: "CNY",
      stockStatus: "in_stock",
      collectedAt: "2026-08-14T00:00:00.000Z",
    }]);
    await client.commitCart(task, { previewId: "cart-a", version: 1 });
    await client.previewCheckout(task);
    await client.createInvitePay(task, { previewId: "checkout-a", version: 1 });

    expect(bodies).toHaveLength(4);
    expect(bodies).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: "task-client-1", taskVersion: 7 }),
    ]));
    expect(bodies.every((body) =>
      body.taskId === task.taskId && body.taskVersion === task.version,
    )).toBe(true);
  });
});
