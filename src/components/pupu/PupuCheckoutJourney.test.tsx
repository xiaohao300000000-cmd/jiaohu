import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "../../domain/task-contract";
import { PupuCheckoutJourney } from "./PupuCheckoutJourney";

const task: TaskSnapshot = {
  taskId: "task-checkout", version: 5, requestText: "买鸡胸肉",
  domain: "commerce", goal: "create_order",
  phase: "awaiting_order_confirmation",
  context: {
    dietaryRequirements: [], requirements: ["买鸡胸肉"], selectedProducts: [],
  },
  requestedCapabilities: ["commerce.catalog.search"],
  allowedCapabilities: ["commerce.checkout.preview"],
  nextActions: ["preview_checkout"],
};
const preview = {
  previewId: "checkout-a", version: 1, addressHint: "已选择的朴朴地址",
  lines: [{ name: "鸡胸肉", quantity: 1, priceCents: 1390 }],
  productTotalCents: 1390, deliveryFeeCents: 300, discountCents: 100,
  payableCents: 1590, expiresAt: "2999-01-01T00:00:00Z",
};
function commerce(createReject = false) {
  const previewTask = {
    ...task, version: 6,
    context: {
      ...task.context,
      checkoutPreview: { id: "checkout-a", version: 1, expiresAt: preview.expiresAt },
    },
  };
  return {
    previewCheckout: vi.fn().mockResolvedValue({ ...preview, task: previewTask }),
    createInvitePay: createReject
      ? vi.fn().mockRejectedValue(new Error("uncertain"))
      : vi.fn().mockResolvedValue({
          checkoutId: "checkout-a", status: "WAITING_PAY", payableCents: 1590,
          paymentTarget: "pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=invite-a",
          task: { ...previewTask, version: 8, phase: "awaiting_payment" },
        }),
    previewCart: vi.fn(),
    commitCart: vi.fn(),
  };
}

describe("PupuCheckoutJourney", () => {
  it("separates settlement inspection, task-bound order confirmation, and payment navigation", async () => {
    const user = userEvent.setup();
    const client = commerce();
    render(<PupuCheckoutJourney task={task} commerce={client as never} />);
    await user.click(screen.getByRole("button", { name: "查看实时结算金额" }));
    expect(await screen.findByText("待付款 ¥15.90")).toBeVisible();
    expect(screen.getByText("这一步尚未创建订单")).toBeVisible();
    expect(client.createInvitePay).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认并创建真实待付款订单" }));
    expect(client.createInvitePay).toHaveBeenCalledWith(
      { taskId: "task-checkout", version: 6 },
      { previewId: "checkout-a", version: 1 },
    );
    expect(await screen.findByRole("link", { name: "去朴朴官方付款" }))
      .toHaveAttribute("href", expect.stringContaining("invite-a"));
  });

  it("keeps order creation locked after an uncertain result", async () => {
    const user = userEvent.setup();
    const client = commerce(true);
    render(<PupuCheckoutJourney task={task} commerce={client as never} />);
    await user.click(screen.getByRole("button", { name: "查看实时结算金额" }));
    await user.click(await screen.findByRole("button", { name: "确认并创建真实待付款订单" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "确认并创建真实待付款订单" })).toBeDisabled();
  });
});
