import { describe, expect, it, vi } from "vitest";
import { PupuCartController } from "./cart-controller";

const scope = { cliPath: "/opt/pupu", accountId: "acct_0123456789abcdef0123456789abcdef", accountsRoot: "/srv/accounts", dataRoot: "/srv/data" };
const binding = { receiverId: "receiver-a", storeId: "store-a", placeId: "place-a", placeZip: 350100 };
const products = [
  { productId: "store-product-a", providerProductId: "product-a", name: "鸡胸肉", unitPrice: 13.9, quantity: 1, currency: "CNY" as const, stockStatus: "in_stock" as const, specification: "300g", collectedAt: new Date().toISOString() },
];

describe("PupuCartController", () => {
  it("previews only products from the current account/address plan", () => {
    const controller = new PupuCartController();
    controller.registerPlan(scope.accountId, "plan-a", binding, products);
    const preview = controller.preview(scope.accountId, binding, "plan-a", [{ productId: "store-product-a", quantity: 2 }]);
    expect(preview).toMatchObject({ version: 1, totalCents: 2780, items: [{ quantity: 2, name: "鸡胸肉" }] });
    expect(() => controller.preview(scope.accountId, { ...binding, storeId: "store-b" }, "plan-a", [{ productId: "store-product-a", quantity: 1 }])).toThrow("address");
    expect(() => controller.preview(scope.accountId, binding, "plan-a", [{ productId: "unknown", quantity: 1 }])).toThrow("product");
  });

  it("commits once and returns the same result for a duplicate idempotency key", async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true, status: "succeeded", data: {
        status: "verified",
        cart: { items: [{ sku: { store_product_id: "store-product-a", product_id: "product-a", name: "鸡胸肉", price_cents: 1390 }, quantity: 2 }] },
      },
    });
    const controller = new PupuCartController({ execute, writeItem: vi.fn().mockResolvedValue("/srv/runtime/item.json") });
    controller.registerPlan(scope.accountId, "plan-a", binding, products);
    const preview = controller.preview(scope.accountId, binding, "plan-a", [{ productId: "store-product-a", quantity: 2 }]);
    const first = await controller.commit(scope, binding, "actor-a", {
      previewId: preview.previewId, version: preview.version, idempotencyKey: "idem-12345678",
    });
    const second = await controller.commit(scope, binding, "actor-a", {
      previewId: preview.previewId, version: preview.version, idempotencyKey: "idem-12345678",
    });
    expect(first).toEqual(second);
    expect(first.status).toBe("verified");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("fails closed on changed version and provider mismatch", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { status: "mismatch" } });
    const controller = new PupuCartController({ execute, writeItem: vi.fn().mockResolvedValue("/srv/runtime/item.json") });
    controller.registerPlan(scope.accountId, "plan-a", binding, products);
    const preview = controller.preview(scope.accountId, binding, "plan-a", [{ productId: "store-product-a", quantity: 1 }]);
    await expect(controller.commit(scope, binding, "actor-a", {
      previewId: preview.previewId, version: 2, idempotencyKey: "idem-abcdefgh",
    })).rejects.toThrow("version");
    await expect(controller.commit(scope, binding, "actor-a", {
      previewId: preview.previewId, version: 1, idempotencyKey: "idem-abcdefgh",
    })).rejects.toThrow("verify");
  });
});
