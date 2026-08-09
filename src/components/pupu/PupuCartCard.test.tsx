import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDemoPupuPurchaseEvent } from "../agent/agent-ui-event";
import { PupuCartCard } from "./PupuCartCard";

describe("PupuCartCard", () => {
  it("shows a versioned assistant cart without claiming a real sync", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    render(
      <PupuCartCard
        payload={createDemoPupuPurchaseEvent("买火锅食材").payload}
        onSync={onSync}
      />,
    );

    expect(screen.getByText("已加入助手购物车")).toBeVisible();
    expect(screen.getByText("购物车版本 v1")).toBeVisible();
    expect(screen.queryByText("示例数据")).not.toBeInTheDocument();
    expect(screen.queryByText("已同步朴朴购物车")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "同步到朴朴购物车" }));
    expect(onSync).toHaveBeenCalledOnce();
  });
});
