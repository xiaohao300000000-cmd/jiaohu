import { describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "../../src/domain/task-contract";
import { PupuCartController } from "./cart-controller";

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
const task: TaskSnapshot = {
  taskId: "70000000-0000-4000-8000-000000000002",
  version: 7,
  requestText: "买两份鸡胸肉",
  domain: "commerce",
  goal: "prepare_cart",
  phase: "awaiting_cart_confirmation",
  context: {
    dietaryRequirements: [],
    requirements: [],
    addressBinding: binding,
    selectedProducts: [{
      productId: "store-product-a",
      providerProductId: "product-a",
      name: "鸡胸肉",
      quantity: 2,
      unitPriceCents: 1390,
      source: "pupu_live",
    }],
  },
  finalPlan: {
    planId: "70000000-0000-4000-8000-000000000003",
    version: 2,
    title: "低脂晚餐",
    explanation: "结构化方案",
    totalCents: 2780,
    currency: "CNY",
  },
  requestedCapabilities: ["commerce.catalog.search"],
  allowedCapabilities: ["commerce.cart.prepare"],
  nextActions: ["prepare_cart"],
};

describe("PupuCartController", () => {
  it("derives the preview only from the authoritative TaskSnapshot", () => {
    const preview = new PupuCartController().preview(task, binding);

    expect(preview).toEqual({
      planId: task.finalPlan?.planId,
      binding,
      items: [{
        productId: "store-product-a",
        providerProductId: "product-a",
        name: "鸡胸肉",
        quantity: 2,
        unitPriceCents: 1390,
        totalCents: 2780,
      }],
      totalCents: 2780,
    });
  });

  it("commits a stored confirmation after controller recreation", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: "succeeded",
        data: { status: "verified" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "succeeded",
        data: {
          cart: {
            items: [{
              sku: { store_product_id: "store-product-a", name: "鸡胸肉" },
              quantity: 2,
            }],
          },
        },
      });
    const preview = new PupuCartController().preview(task, binding);
    const controller = new PupuCartController({
      execute,
      writeItem: vi.fn().mockResolvedValue("/srv/runtime/item.json"),
    });

    const result = await controller.commit(
      scope,
      binding,
      "actor-a",
      "70000000-0000-4000-8000-000000000004",
      preview,
    );

    expect(result).toEqual({
      status: "verified",
      confirmationId: "70000000-0000-4000-8000-000000000004",
      cartItems: [{
        productId: "store-product-a",
        name: "鸡胸肉",
        quantity: 2,
      }],
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rejects a stored payload whose address differs from the task binding", async () => {
    const preview = new PupuCartController().preview(task, binding);
    const controller = new PupuCartController({
      execute: vi.fn(),
      writeItem: vi.fn(),
    });

    await expect(controller.commit(
      scope,
      binding,
      "actor-a",
      "70000000-0000-4000-8000-000000000004",
      { ...preview, binding: { ...binding, storeId: "store-b" } },
    )).rejects.toThrow("address");
  });
});
