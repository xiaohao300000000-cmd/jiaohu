import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "../../domain/task-contract";
import { PupuCartConfirmCard } from "./PupuCartConfirmCard";

const products = [{
  productId: "sku-a", providerProductId: "product-a", name: "鸡胸肉",
  specification: "300g", unitPrice: 13.9, quantity: 1,
  currency: "CNY" as const, stockStatus: "in_stock" as const,
  collectedAt: new Date().toISOString(),
}];
const task: TaskSnapshot = {
  taskId: "task-a", version: 2, requestText: "买鸡胸肉",
  domain: "commerce", goal: "find_products",
  phase: "awaiting_cart_confirmation",
  context: {
    dietaryRequirements: [], requirements: ["买鸡胸肉"],
    selectedProducts: [{
      productId: "sku-a", providerProductId: "product-a", name: "鸡胸肉",
      quantity: 1, unitPriceCents: 1390, source: "pupu_live",
    }],
  },
  requestedCapabilities: ["commerce.catalog.search"],
  allowedCapabilities: ["commerce.cart.prepare"],
  nextActions: ["prepare_cart"],
};

function commerce(commitResult: Promise<{ status: string }> = Promise.resolve({ status: "verified" })) {
  const afterPreview = {
    ...task, version: 3,
    context: {
      ...task.context,
      cartPreview: { id: "cart-a", version: 1, expiresAt: "2999-01-01T00:00:00Z" },
    },
  };
  const afterCommit = {
    ...afterPreview, version: 5, phase: "awaiting_order_confirmation" as const,
  };
  return {
    previewCart: vi.fn().mockResolvedValue({
      previewId: "cart-a", version: 1, totalCents: 1390, task: afterPreview,
    }),
    commitCart: vi.fn(async () => ({ ...(await commitResult), task: afterCommit })),
    previewCheckout: vi.fn(),
    createInvitePay: vi.fn(),
  };
}

describe("PupuCartConfirmCard", () => {
  it("shows exact consequences and requires a separate task-bound commit click", async () => {
    const user = userEvent.setup();
    const client = commerce();
    render(<PupuCartConfirmCard
      products={products} task={task} planId="run-a" commerce={client as never}
    />);
    expect(screen.getByText("尚未修改真实购物车")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "准备加入购物车" }));
    expect(client.previewCart).toHaveBeenCalledWith(
      { taskId: "task-a", version: 2 }, "run-a", products,
    );
    expect(await screen.findByText("将写入 1 件商品，预计 ¥13.90")).toBeVisible();
    expect(client.commitCart).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认加入朴朴购物车" }));
    expect(client.commitCart).toHaveBeenCalledWith(
      { taskId: "task-a", version: 3 },
      { previewId: "cart-a", version: 1 },
    );
    expect(await screen.findByText("已写入并核对真实购物车")).toBeVisible();
  });

  it("announces that a real cart write is still running", async () => {
    const user = userEvent.setup();
    let finish!: (value: { status: string }) => void;
    const client = commerce(new Promise((resolve) => { finish = resolve; }));
    render(<PupuCartConfirmCard
      products={products} task={task} planId="run-a" commerce={client as never}
    />);
    await user.click(screen.getByRole("button", { name: "准备加入购物车" }));
    await user.click(await screen.findByRole("button", { name: "确认加入朴朴购物车" }));
    expect(screen.getByText(/正在写入并核对真实购物车/)).toBeVisible();
    finish({ status: "verified" });
  });
});
