import { describe, expect, it, vi } from "vitest";
import { PupuCheckoutController } from "./checkout-controller";

const scope = { cliPath: "/opt/pupu", accountId: "acct_0123456789abcdef0123456789abcdef", accountsRoot: "/srv/accounts", dataRoot: "/srv/data" };
const binding = { receiverId: "receiver-a", storeId: "store-a", placeId: "place-a", placeZip: 350100 };

describe("PupuCheckoutController", () => {
  it("maps a redacted settlement preview and rejects address changes", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, status: "succeeded", data: {
      preview_id: "checkout-a", lines: [{ name: "鸡胸肉", quantity: 1, price: 1390 }],
      product_total_price: 1390, logistics_fee: 300, total_discount_amount: 100,
      total_amount: 1590, selected_delivery_text: "约 30 分钟", expires_at: "2999-01-01T00:00:00Z",
      receiver_id: "receiver-a", store_id: "store-a", place_id: "place-a",
    } });
    const controller = new PupuCheckoutController({ execute });
    const preview = await controller.preview(scope, binding);
    expect(preview).toMatchObject({ previewId: "checkout-a", payableCents: 1590, addressHint: "已选择的朴朴地址" });
    expect(JSON.stringify(preview)).not.toMatch(/receiver-a|store-a|place-a/);
    await expect(controller.create(scope, { ...binding, storeId: "store-b" }, "actor-a", {
      previewId: "checkout-a", version: 1, idempotencyKey: "order-12345678",
    })).rejects.toThrow("address");
  });

  it("validates the official invite-pay target and deduplicates creation", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: {
        preview_id: "checkout-a", lines: [{ name: "鸡胸肉", quantity: 1, price: 1390 }],
        product_total_price: 1390, logistics_fee: 0, total_discount_amount: 0,
        total_amount: 1390, expires_at: "2999-01-01T00:00:00Z",
        receiver_id: "receiver-a", store_id: "store-a", place_id: "place-a",
      } })
      .mockResolvedValueOnce({ ok: true, data: {
        order: { order_id: "order-a" },
        invite_pay: { invite_pay_id: "invite-a", order_id: "order-a", status: "WAITING_PAY" },
        share: { invite_pay_id: "invite-a", url: "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=invite-a" },
      } });
    const controller = new PupuCheckoutController({ execute });
    await controller.preview(scope, binding);
    const input = { previewId: "checkout-a", version: 1, idempotencyKey: "order-12345678" };
    const first = await controller.create(scope, binding, "actor-a", input);
    const second = await controller.create(scope, binding, "actor-a", input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: "WAITING_PAY", payableCents: 1390, paymentTarget: expect.stringContaining("invite-a") });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("accepts a freshly created invite-pay response when Pupu omits its status", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: {
        preview_id: "checkout-a", lines: [{ name: "鸡胸肉", quantity: 1, price: 1390 }],
        product_total_price: 1390, logistics_fee: 0, total_discount_amount: 0,
        total_amount: 1390, expires_at: "2999-01-01T00:00:00Z",
        receiver_id: "receiver-a", store_id: "store-a", place_id: "place-a",
      } })
      .mockResolvedValueOnce({ ok: true, status: "succeeded", data: {
        order: { order_id: "order-a" },
        invite_pay: { invite_pay_id: "invite-a", order_id: "order-a", status: null },
        share: { invite_pay_id: "invite-a", url: "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=invite-a" },
      } });
    const controller = new PupuCheckoutController({ execute });
    await controller.preview(scope, binding);
    await expect(controller.create(scope, binding, "actor-a", {
      previewId: "checkout-a", version: 1, idempotencyKey: "order-no-status",
    })).resolves.toMatchObject({ status: "WAITING_PAY" });
  });

  it("rejects a malicious or mismatched payment target", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: {
        preview_id: "checkout-a", lines: [{ name: "鸡胸肉", quantity: 1, price: 1390 }],
        product_total_price: 1390, logistics_fee: 0, total_discount_amount: 0,
        total_amount: 1390, expires_at: "2999-01-01T00:00:00Z",
        receiver_id: "receiver-a", store_id: "store-a", place_id: "place-a",
      } })
      .mockResolvedValueOnce({ ok: true, data: {
        order: { order_id: "order-a" },
        invite_pay: { invite_pay_id: "invite-a", order_id: "order-a", status: "WAITING_PAY" },
        share: { invite_pay_id: "invite-a", url: "https://evil.example/pay?invite_pay_id=invite-a" },
      } });
    const controller = new PupuCheckoutController({ execute });
    await controller.preview(scope, binding);
    await expect(controller.create(scope, binding, "actor-a", {
      previewId: "checkout-a", version: 1, idempotencyKey: "order-abcdefgh",
    })).rejects.toThrow("payment");
  });
});
