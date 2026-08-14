import { describe, expect, it, vi } from "vitest";
import { PupuCheckoutController } from "./checkout-controller";

const scope = {
  cliPath: "/opt/pupu",
  accountId: "acct_0123456789abcdef0123456789abcdef",
  accountsRoot: "/srv/accounts",
  dataRoot: "/srv/data",
};
const binding = {
  receiverId: "receiver-a",
  storeId: "store-a",
  placeId: "place-a",
  placeZip: 350100,
};
const previewResult = {
  ok: true,
  status: "succeeded",
  data: {
    preview_id: "checkout-a",
    lines: [{ name: "鸡胸肉", quantity: 1, price: 1390 }],
    product_total_price: 1390,
    logistics_fee: 300,
    total_discount_amount: 100,
    total_amount: 1590,
    selected_delivery_text: "约 30 分钟",
    expires_at: "2999-01-01T00:00:00Z",
    receiver_id: "receiver-a",
    store_id: "store-a",
    place_id: "place-a",
  },
};

describe("PupuCheckoutController", () => {
  it("maps a redacted settlement preview", async () => {
    const execute = vi.fn().mockResolvedValue(previewResult);
    const preview = await new PupuCheckoutController({ execute }).preview(
      scope,
      binding,
    );

    expect(preview).toMatchObject({
      previewId: "checkout-a",
      payableCents: 1590,
      addressHint: "已选择的朴朴地址",
    });
    expect(JSON.stringify(preview)).not.toMatch(/receiver-a|store-a|place-a/);
  });

  it("creates from a stored preview after controller recreation", async () => {
    const preview = await new PupuCheckoutController({
      execute: vi.fn().mockResolvedValue(previewResult),
    }).preview(scope, binding);
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        order: { order_id: "order-a" },
        invite_pay: {
          invite_pay_id: "invite-a",
          order_id: "order-a",
          status: "WAITING_PAY",
        },
        share: {
          invite_pay_id: "invite-a",
          url: "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=invite-a",
        },
      },
    });

    const result = await new PupuCheckoutController({ execute }).create(
      scope,
      binding,
      "actor-a",
      preview,
    );

    expect(result).toMatchObject({
      checkoutId: "checkout-a",
      status: "WAITING_PAY",
      payableCents: 1590,
      paymentTarget: expect.stringContaining("invite-a"),
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects expired stored previews and malicious payment targets", async () => {
    const preview = await new PupuCheckoutController({
      execute: vi.fn().mockResolvedValue(previewResult),
    }).preview(scope, binding);
    const controller = new PupuCheckoutController({
      execute: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          order: { order_id: "order-a" },
          invite_pay: {
            invite_pay_id: "invite-a",
            order_id: "order-a",
            status: "WAITING_PAY",
          },
          share: {
            url: "https://evil.example/pay?invite_pay_id=invite-a",
          },
        },
      }),
    });

    await expect(controller.create(
      scope,
      binding,
      "actor-a",
      { ...preview, expiresAt: "2000-01-01T00:00:00Z" },
    )).rejects.toThrow("expired");
    await expect(controller.create(
      scope,
      binding,
      "actor-a",
      preview,
    )).rejects.toThrow("payment");
  });
});
