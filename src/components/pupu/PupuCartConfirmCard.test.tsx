import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PupuCartConfirmCard } from "./PupuCartConfirmCard";

const products = [{
  productId: "sku-a", providerProductId: "product-a", name: "鸡胸肉", specification: "300g",
  unitPrice: 13.9, quantity: 1, currency: "CNY" as const, stockStatus: "in_stock" as const,
  collectedAt: new Date().toISOString(),
}];

describe("PupuCartConfirmCard", () => {
  it("shows exact consequences and requires a separate commit click", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue({ previewId: "cart-a", version: 1, totalCents: 1390 });
    const onCommit = vi.fn().mockResolvedValue({ status: "verified" });
    render(<PupuCartConfirmCard products={products} onPreview={onPreview} onCommit={onCommit} />);
    expect(screen.getByText("尚未修改真实购物车")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "准备加入购物车" }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(await screen.findByText("将写入 1 件商品，预计 ¥13.90")).toBeVisible();
    expect(onCommit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认加入朴朴购物车" }));
    expect(onCommit).toHaveBeenCalledWith({ previewId: "cart-a", version: 1 });
    expect(await screen.findByText("已写入并核对真实购物车")).toBeVisible();
  });

  it("announces that a real cart write is still running", async () => {
    const user = userEvent.setup();
    let finish!: (value: { status: string }) => void;
    const onCommit = vi.fn(() => new Promise<{ status: string }>((resolve) => { finish = resolve; }));
    render(<PupuCartConfirmCard products={products}
      onPreview={vi.fn().mockResolvedValue({ previewId: "cart-a", version: 1, totalCents: 1390 })}
      onCommit={onCommit} />);
    await user.click(screen.getByRole("button", { name: "准备加入购物车" }));
    await user.click(await screen.findByRole("button", { name: "确认加入朴朴购物车" }));
    expect(screen.getByText(/正在写入并核对真实购物车/)).toBeVisible();
    finish({ status: "verified" });
  });
});
