import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDemoPupuPurchaseEvent } from "../agent/agent-ui-event";
import { PupuPurchaseCard } from "./PupuPurchaseCard";

describe("PupuPurchaseCard", () => {
  it("shows product facts, images, and the demo source", () => {
    render(
      <PupuPurchaseCard
        event={createDemoPupuPurchaseEvent("买火锅食材")}
        onAddToCart={vi.fn()}
      />,
    );

    expect(screen.getByText("示例数据")).toBeVisible();
    expect(screen.getAllByRole("img", { name: /商品图/ })).toHaveLength(3);
    expect(screen.getByText("合计 ¥74.60")).toBeVisible();
    expect(screen.getByRole("button", { name: "加入购物车" })).toBeEnabled();
  });

  it("keeps the product readable when an image fails", () => {
    render(
      <PupuPurchaseCard
        event={createDemoPupuPurchaseEvent("买火锅食材")}
        onAddToCart={vi.fn()}
      />,
    );

    fireEvent.error(screen.getAllByRole("img", { name: /商品图/ })[0]);

    expect(screen.getByLabelText("商品暂无图片")).toBeVisible();
    expect(screen.getByText("谷饲肥牛卷")).toBeVisible();
    expect(screen.getByText("¥29.90")).toBeVisible();
  });
});
