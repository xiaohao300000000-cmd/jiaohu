import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initialJourneySnapshot } from "./journey-reducer";
import { JourneyPresentationRenderer } from "./JourneyPresentationRenderer";
import type { JourneyPresentation } from "./types";

const livePresentation: JourneyPresentation = {
  capability: "pupu",
  component: "pupu.purchase-plan",
  mode: "canvas",
  dataSource: "live",
  payload: {
    stage: "cart_ready",
    title: "朴朴实时商品方案",
    summary: "实时结果",
    meal: "按需采购",
    people: 1,
    constraints: ["只读"],
    decisionSummary: "来自朴朴实时读取",
    products: [],
    estimatedTotal: 12.9,
    currency: "CNY",
    cartVersion: 0,
    estimatedDelivery: "以朴朴实时页面为准",
  },
};

describe("JourneyPresentationRenderer", () => {
  it("selects the typed Pupu renderer from the Journey presentation", () => {
    const { container } = render(
      <JourneyPresentationRenderer
        snapshot={{
          ...initialJourneySnapshot,
          state: "ready",
          activeRequestId: "request-1",
          presentation: livePresentation,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "按需采购 · 1 人" })).toBeVisible();
    const card = container.querySelector('[data-component="pupu.purchase-plan"]');
    expect(card).toHaveAttribute("data-source", "live");
  });

  it("falls back to the generic LiquidJourney surface without a presentation", () => {
    render(<JourneyPresentationRenderer snapshot={initialJourneySnapshot} />);

    expect(screen.getByRole("heading", { name: "Pupu 已就绪" })).toBeVisible();
  });
});
