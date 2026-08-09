import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
