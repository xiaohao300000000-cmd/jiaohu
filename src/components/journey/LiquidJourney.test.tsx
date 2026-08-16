import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiquidJourney } from "./LiquidJourney";
import { initialJourneySnapshot } from "./journey-reducer";
import type { JourneySnapshot } from "./types";

const requestText = "今晚三个人吃火锅，微辣，200元以内。";

function snapshot(
  overrides: Partial<JourneySnapshot>,
): JourneySnapshot {
  return {
    ...initialJourneySnapshot,
    activeRequestId: "request-1",
    requestText,
    ...overrides,
  };
}

describe("LiquidJourney", () => {
  it("renders the receiving request and active status", () => {
    const { container } = render(
      <LiquidJourney snapshot={snapshot({ state: "receiving" })} />,
    );

    expect(screen.getByText("正在接收需求")).toBeInTheDocument();
    expect(container.querySelector(".journey-ambient--active")).toBeTruthy();
  });

  it("renders only supplied safe trace summaries while reasoning", () => {
    render(
      <LiquidJourney
        snapshot={snapshot({
          state: "reasoning",
          trace: [
            {
              id: "budget",
              label: "核对预算与人数",
              detail: "3 人 · 不超过 ¥200",
              status: "complete",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("核对预算与人数")).toBeInTheDocument();
    expect(screen.getByText("3 人 · 不超过 ¥200")).toBeInTheDocument();
    expect(screen.queryByText(/思维链|chain of thought/i)).not.toBeInTheDocument();
  });

  it("keeps assembling results and the ready action in separate regions", () => {
    const onOpenPlan = vi.fn();
    const { rerender } = render(
      <LiquidJourney
        snapshot={snapshot({
          state: "assembling",
          partialResult: {
            title: "今晚的微辣火锅方案",
            totalAmount: 168.5,
          },
        })}
        onOpenPlan={onOpenPlan}
      />,
    );

    const resultsRegion = screen.getByTestId("journey-results");
    const actionRegion = screen.getByTestId("journey-action");
    expect(resultsRegion).toHaveTextContent("今晚的微辣火锅方案");
    expect(actionRegion).toBeEmptyDOMElement();
    expect(resultsRegion.parentElement).toBe(actionRegion.parentElement);

    rerender(
      <LiquidJourney
        snapshot={snapshot({
          state: "ready",
          result: {
            title: "今晚的微辣火锅方案",
            summary: "荤素搭配，预计 30 分钟送达",
            totalAmount: 168.5,
            currency: "CNY",
            items: [
              {
                id: "beef",
                name: "原切肥牛卷",
                detail: "350g · 冷鲜",
                price: 58,
              },
            ],
          },
        })}
        onOpenPlan={onOpenPlan}
      />,
    );

    expect(screen.getByText("¥168.50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看采购方案" }));
    expect(onOpenPlan).toHaveBeenCalledOnce();
    expect(screen.getByTestId("journey-results")).not.toContainElement(
      screen.getByRole("button", { name: "查看采购方案" }),
    );
  });

  it("expands the procurement list when no external onOpenPlan is wired", () => {
    render(
      <LiquidJourney
        snapshot={snapshot({
          state: "ready",
          result: {
            title: "今晚的微辣火锅方案",
            summary: "荤素搭配，预计 30 分钟送达",
            totalAmount: 168.5,
            currency: "CNY",
            items: [
              {
                id: "beef",
                name: "原切肥牛卷",
                detail: "350g · 冷鲜",
                price: 58,
              },
              {
                id: "drink",
                name: "无糖鲜榨玉米汁",
                detail: "冷藏 · 1L",
                price: 18,
              },
            ],
          },
        })}
      />,
    );

    expect(screen.queryByTestId("journey-plan-detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看采购方案" }));

    const detail = screen.getByTestId("journey-plan-detail");
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent("原切肥牛卷");
    expect(detail).toHaveTextContent("无糖鲜榨玉米汁");
    expect(detail).toHaveTextContent("¥58.00");
    expect(detail).toHaveTextContent("¥18.00");
    expect(screen.getByRole("button", { name: "收起采购清单" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起采购清单" }));
    expect(screen.queryByTestId("journey-plan-detail")).not.toBeInTheDocument();
  });

  it("does not loop ambient attention in idle", () => {
    const { container } = render(
      <LiquidJourney snapshot={snapshot({ state: "idle" })} />,
    );

    expect(container.querySelector(".journey-ambient--active")).toBeNull();
    expect(screen.getByText("准备接收新的生活指令")).toBeInTheDocument();
  });
});
