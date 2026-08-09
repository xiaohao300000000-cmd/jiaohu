import { describe, expect, it } from "vitest";
import { createDemoPupuPurchaseEvent } from "./agent-ui-event";

describe("Agent UI event contract", () => {
  it("creates an explicitly labeled Pupu demo event", () => {
    const event = createDemoPupuPurchaseEvent("两个人吃火锅，预算 120 元");

    expect(event).toMatchObject({
      capability: "pupu",
      intent: "pupu.purchase_plan",
      presentationMode: "canvas",
      component: "pupu.purchase-plan",
      dataSource: "demo",
    });
    expect(event.payload.products).toHaveLength(3);
    expect(event.payload.products[0]).toMatchObject({
      productId: expect.any(String),
      imageUrl: expect.any(String),
      collectedAt: expect.any(String),
    });
  });
});
