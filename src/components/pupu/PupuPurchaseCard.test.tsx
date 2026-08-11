import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDemoPupuPurchaseEvent } from "../agent/agent-ui-event";
import type { JourneyPresentation, PupuJourneyPayload } from "../journey/types";
import { PupuPurchaseCard } from "./PupuPurchaseCard";

function demoPresentation(
  input: string,
  overrides: Partial<PupuJourneyPayload> = {},
): Extract<JourneyPresentation, { component: "pupu.purchase-plan" }> {
  const event = createDemoPupuPurchaseEvent(input);
  const { budget, total, ...payload } = event.payload;
  return {
    capability: "pupu",
    component: "pupu.purchase-plan",
    mode: event.presentationMode,
    dataSource: event.dataSource,
    payload: {
      ...payload,
      estimatedTotal: total,
      userBudget: budget,
      ...overrides,
    },
  };
}

describe("PupuPurchaseCard", () => {
  it("leads with the Agent decision and keeps products as evidence", async () => {
    const user = userEvent.setup();
    render(
      <PupuPurchaseCard
        presentation={demoPresentation("两个人今晚火锅，120以内")}
        instanceId="test-budget"
        onAddToCart={vi.fn()}
      />,
    );

    expect(screen.getByText("火锅 · 2 人")).toBeVisible();
    expect(screen.getByText("¥74.60 / ¥120.00")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
    expect(screen.getByText("约 30 min")).toBeVisible();
    expect(screen.getByText("不辣")).toBeVisible();
    expect(screen.queryByText("示例数据")).not.toBeInTheDocument();
    expect(screen.queryByText("谷饲肥牛卷")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "查看商品证据（3 件）" }),
    );

    expect(screen.getAllByRole("img", { name: /商品图/ })).toHaveLength(3);
    expect(screen.getByText("谷饲肥牛卷")).toBeVisible();
    expect(screen.getByText("01")).toBeVisible();
    expect(screen.getByText("02")).toBeVisible();
    expect(screen.getByText("03")).toBeVisible();
    expect(screen.getByRole("button", { name: "加入购物车" })).toBeEnabled();
  });

  it("keeps the product readable when an image fails", async () => {
    const user = userEvent.setup();
    render(
      <PupuPurchaseCard
        presentation={demoPresentation("买火锅食材")}
        instanceId="test-images"
        onAddToCart={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "查看商品证据（3 件）" }),
    );
    fireEvent.error(screen.getAllByRole("img", { name: /商品图/ })[0]);

    expect(screen.getByLabelText("商品暂无图片")).toBeVisible();
    expect(screen.getByText("谷饲肥牛卷")).toBeVisible();
    expect(screen.getByText("¥29.90")).toBeVisible();
  });

  it("does not invent budget progress when the user supplied no budget", () => {
    render(
      <PupuPurchaseCard
        presentation={demoPresentation("搜索牛奶", {
          estimatedTotal: 12.9,
          userBudget: undefined,
        })}
        instanceId="test-no-budget"
        readOnly
      />,
    );

    expect(screen.getByText("预估合计")).toBeVisible();
    expect(screen.getByText("¥12.90")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("预算")).toBeNull();
  });

  it("never renders NaN or Infinity for malformed totals or budgets", () => {
    const { container } = render(
      <PupuPurchaseCard
        presentation={demoPresentation("搜索牛奶", {
          estimatedTotal: Number.POSITIVE_INFINITY,
          userBudget: Number.NaN,
        })}
        instanceId="test-invalid-number"
        readOnly
      />,
    );

    expect(container).not.toHaveTextContent(/NaN|Infinity/);
    expect(screen.getByText("¥0.00")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
