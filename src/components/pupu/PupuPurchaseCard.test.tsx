import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDemoPupuPurchaseEvent } from "../agent/agent-ui-event";
import { PupuPurchaseCard } from "./PupuPurchaseCard";

describe("PupuPurchaseCard", () => {
  it("leads with the Agent decision and keeps products as evidence", async () => {
    const user = userEvent.setup();
    render(
      <PupuPurchaseCard
        event={createDemoPupuPurchaseEvent("两个人今晚火锅，120以内")}
        onAddToCart={vi.fn()}
      />,
    );

    expect(screen.getByText("火锅 · 2 人")).toBeVisible();
    expect(screen.getByText("¥74.60 / ¥120")).toBeVisible();
    expect(screen.getByText("约 30 min")).toBeVisible();
    expect(screen.getByText("不辣")).toBeVisible();
    expect(screen.queryByText("示例数据")).not.toBeInTheDocument();
    expect(screen.queryByText("谷饲肥牛卷")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "查看商品证据（3 件）" }),
    );

    expect(screen.getAllByRole("img", { name: /商品图/ })).toHaveLength(3);
    expect(screen.getByText("谷饲肥牛卷")).toBeVisible();
    expect(screen.getByRole("button", { name: "加入购物车" })).toBeEnabled();
  });

  it("keeps the product readable when an image fails", async () => {
    const user = userEvent.setup();
    render(
      <PupuPurchaseCard
        event={createDemoPupuPurchaseEvent("买火锅食材")}
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
});
