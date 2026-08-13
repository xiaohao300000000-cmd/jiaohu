import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PupuCheckoutJourney } from "./PupuCheckoutJourney";

describe("PupuCheckoutJourney", () => {
  it("separates settlement inspection, real order confirmation, and payment navigation", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue({
      previewId: "checkout-a", version: 1, addressHint: "已选择的朴朴地址",
      lines: [{ name: "鸡胸肉", quantity: 1, priceCents: 1390 }],
      productTotalCents: 1390, deliveryFeeCents: 300, discountCents: 100,
      payableCents: 1590, expiresAt: "2999-01-01T00:00:00Z",
    });
    const onCreate = vi.fn().mockResolvedValue({
      checkoutId: "checkout-a", status: "WAITING_PAY", payableCents: 1590,
      paymentTarget: "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=invite-a",
    });
    render(<PupuCheckoutJourney onPreview={onPreview} onCreate={onCreate} />);
    await user.click(screen.getByRole("button", { name: "查看实时结算金额" }));
    expect(await screen.findByText("待付款 ¥15.90")).toBeVisible();
    expect(screen.getByText("这一步尚未创建订单")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认并创建真实待付款订单" }));
    expect(onCreate).toHaveBeenCalledWith({ previewId: "checkout-a", version: 1 });
    const link = await screen.findByRole("link", { name: "去朴朴官方付款" });
    expect(link).toHaveAttribute("href", expect.stringContaining("invite-a"));
    expect(screen.getByText("WAITING_PAY · 尚未付款")).toBeVisible();
  });

  it("keeps order creation locked after an uncertain result", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue({
      previewId: "checkout-a", version: 1, addressHint: "已选择的朴朴地址",
      lines: [{ name: "鸡胸肉", quantity: 1, priceCents: 1390 }],
      productTotalCents: 1390, deliveryFeeCents: 0, discountCents: 0,
      payableCents: 1390, expiresAt: "2999-01-01T00:00:00Z",
    });
    const onCreate = vi.fn().mockRejectedValue(new Error("uncertain"));
    render(<PupuCheckoutJourney onPreview={onPreview} onCreate={onCreate} />);
    await user.click(screen.getByRole("button", { name: "查看实时结算金额" }));
    await user.click(await screen.findByRole("button", { name: "确认并创建真实待付款订单" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "确认并创建真实待付款订单" })).toBeDisabled();
  });
});
