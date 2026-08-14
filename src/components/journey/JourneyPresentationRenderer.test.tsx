import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../domain/task-contract";
import { initialJourneySnapshot } from "./journey-reducer";
import { JourneyPresentationRenderer } from "./JourneyPresentationRenderer";
import type { JourneyPresentation } from "./types";

const candidatePresentation = {
  capability: "pupu",
  component: "pupu.purchase-plan",
  mode: "canvas",
  dataSource: "live",
  payload: {
    stage: "cart_ready",
    title: "候选商品",
    summary: "这不是最终方案",
    meal: "候选",
    people: 1,
    constraints: [],
    decisionSummary: "Hermes 候选",
    products: [],
    estimatedTotal: 12.9,
    currency: "CNY",
    cartVersion: 0,
    estimatedDelivery: "",
  },
} as unknown as JourneyPresentation;

const finalTask: TaskSnapshot = {
  taskId: "task-1",
  version: 5,
  requestText: "买牛奶和鸡蛋",
  domain: "commerce",
  goal: "prepare_cart",
  phase: "awaiting_cart_confirmation",
  context: {
    dietaryRequirements: [],
    requirements: [],
    selectedProducts: [
      { productId: "milk", name: "鲜牛奶", quantity: 2, unitPriceCents: 1290, source: "pupu_live" },
      { productId: "eggs", name: "鲜鸡蛋", quantity: 1, unitPriceCents: 1690, source: "pupu_live" },
    ],
  },
  finalPlan: {
    planId: "plan-from-postgres",
    version: 2,
    title: "早餐补货",
    explanation: "按需求选定。",
    totalCents: 4270,
    currency: "CNY",
  },
  requestedCapabilities: ["commerce.catalog.search"],
  allowedCapabilities: ["commerce.cart.prepare"],
  nextActions: ["confirm_cart"],
};

describe("JourneyPresentationRenderer", () => {
  it("does not render a cart-ready card from a candidate presentation", () => {
    const { container } = render(
      <JourneyPresentationRenderer
        snapshot={{
          ...initialJourneySnapshot,
          state: "ready",
          activeRequestId: "request-1",
          presentation: candidatePresentation,
        }}
      />,
    );

    expect(container.querySelector('[data-component="pupu.purchase-plan"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "把需求变成一份可执行的方案" })).toBeVisible();
  });

  it("renders only the ordered products and plan identity from TaskSnapshot", () => {
    const { container } = render(
      <JourneyPresentationRenderer
        snapshot={{
          ...initialJourneySnapshot,
          state: "ready",
          runId: "run-not-a-plan",
          activeRequestId: "request-2",
          task: finalTask,
        }}
      />,
    );

    const card = container.querySelector('[data-component="pupu.purchase-plan"]');
    expect(card).toHaveAttribute("data-source", "task-snapshot");
    expect(card).toHaveAttribute("data-plan-id", "plan-from-postgres");
    expect(card).not.toHaveAttribute("data-plan-id", "run-not-a-plan");

    fireEvent.click(screen.getByRole("button", { name: "查看已选商品（2 件）" }));
    const names = screen.getAllByText(/鲜牛奶|鲜鸡蛋/);
    expect(names.map((node) => node.textContent)).toEqual(["鲜牛奶", "鲜鸡蛋"]);
  });

  it("falls back to the generic LiquidJourney surface without a presentation", () => {
    render(<JourneyPresentationRenderer snapshot={initialJourneySnapshot} />);
    expect(screen.getByRole("heading", { name: "Pupu 已就绪" })).toBeVisible();
  });
});
