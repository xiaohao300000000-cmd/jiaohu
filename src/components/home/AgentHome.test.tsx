import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentHome } from "./AgentHome";
import { QuickResultCard } from "./QuickResultCard";

describe("QuickResultCard", () => {
  it("renders distinct delivery and weather demo answers", () => {
    const { rerender } = render(<QuickResultCard kind="delivery" />);
    expect(screen.getByText("骑手正在前往商家")).toBeVisible();

    rerender(<QuickResultCard kind="weather" />);
    expect(screen.getByText("今晚有短时阵雨")).toBeVisible();
  });

  it("renders a Pupu order card without claiming live data", () => {
    render(<QuickResultCard kind="pupu_order" />);

    expect(screen.getByText("朴朴订单正在配送")).toBeVisible();
    expect(screen.getByText("示例数据")).toBeVisible();
  });
});

describe("AgentHome capability promise", () => {
  it("offers only the currently implemented Pupu read-only capabilities", () => {
    render(
      <AgentHome
        activeTask={null}
        onSubmit={vi.fn()}
        onExampleSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("直接告诉我你的需求。")).toBeVisible();
    expect(screen.getByRole("button", { name: "朴朴搜索商品" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "查看朴朴商品详情" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "查看朴朴购物车" }),
    ).toBeVisible();
    expect(screen.queryByText("朴朴帮我买")).toBeNull();
    expect(screen.queryByText("今晚吃什么")).toBeNull();
    expect(screen.queryByText("确认退款")).toBeNull();
    expect(screen.queryByText(/快递|外卖/)).toBeNull();
  });
});
