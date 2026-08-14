import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../domain/task-contract";
import { PupuPurchaseCard } from "./PupuPurchaseCard";

function finalTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: "task-1",
    version: 8,
    requestText: "两个人今晚火锅，120以内，不辣",
    domain: "commerce",
    goal: "prepare_cart",
    phase: "awaiting_cart_confirmation",
    context: {
      peopleCount: 2,
      budgetCents: 12000,
      dietaryRequirements: ["不辣"],
      requirements: ["今晚火锅"],
      selectedProducts: [
        { productId: "beef", providerProductId: "provider-beef", name: "谷饲肥牛卷", quantity: 2, unitPriceCents: 2990, source: "pupu_live" },
        { productId: "greens", name: "生菜", quantity: 1, unitPriceCents: 560, source: "pupu_live" },
      ],
    },
    finalPlan: {
      planId: "plan-authoritative",
      version: 3,
      title: "火锅 · 2 人",
      explanation: "Agent 已按预算与饮食要求选定商品。",
      totalCents: 6540,
      currency: "CNY",
    },
    requestedCapabilities: ["commerce.catalog.search"],
    allowedCapabilities: ["commerce.cart.prepare"],
    nextActions: ["confirm_cart"],
    ...overrides,
  };
}

describe("PupuPurchaseCard", () => {
  it("renders the ordered FinalPlan products from TaskSnapshot", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PupuPurchaseCard task={finalTask()} instanceId="run-must-not-be-plan-id" readOnly />,
    );

    expect(screen.getByText("火锅 · 2 人")).toBeVisible();
    expect(screen.getByText("¥65.40 / ¥120.00")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "55");
    expect(screen.getByText("不辣")).toBeVisible();
    expect(screen.queryByText("谷饲肥牛卷")).not.toBeInTheDocument();
    expect(container.querySelector("[data-plan-id]")).toHaveAttribute(
      "data-plan-id",
      "plan-authoritative",
    );

    await user.click(screen.getByRole("button", { name: "查看已选商品（2 件）" }));

    expect(screen.getByText("谷饲肥牛卷")).toBeVisible();
    expect(screen.getByText("数量 2")).toBeVisible();
    expect(screen.getByText("¥59.80")).toBeVisible();
    expect(screen.getByText("01")).toBeVisible();
    expect(screen.getByText("02")).toBeVisible();
  });

  it("does not render without an authoritative FinalPlan", () => {
    const { container } = render(
      <PupuPurchaseCard
        task={finalTask({ finalPlan: undefined })}
        instanceId="candidate-only"
        readOnly
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not invent budget progress when TaskSnapshot has no budget", () => {
    const task = finalTask();
    task.context = { ...task.context, budgetCents: undefined };
    render(<PupuPurchaseCard task={task} instanceId="test-no-budget" readOnly />);

    expect(screen.getByText("合计")).toBeVisible();
    expect(screen.getByText("¥65.40")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("预算")).toBeNull();
  });
});
