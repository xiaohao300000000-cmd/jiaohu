import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../src/domain/task-contract";
import { TaskCoordinator } from "./task-coordinator";

function existingTask(): TaskSnapshot {
  return {
    taskId: "task-1",
    version: 7,
    requestText: "3个人吃低脂晚餐，预算120元",
    domain: "commerce",
    goal: "find_products",
    phase: "awaiting_cart_confirmation",
    context: {
      peopleCount: 3,
      budgetCents: 12_000,
      dietaryRequirements: ["低脂"],
      requirements: ["3个人吃低脂晚餐，预算120元"],
      selectedProducts: [{
        productId: "milk-1",
        providerProductId: "provider-milk-1",
        name: "鲜牛奶",
        quantity: 1,
        unitPriceCents: 1290,
        source: "pupu_live",
      }],
      cartPreview: {
        id: "cart-preview-1",
        version: 1,
        expiresAt: "2026-08-14T18:00:00.000Z",
      },
    },
    requestedCapabilities: ["commerce.catalog.meal-search"],
    allowedCapabilities: ["commerce.cart.prepare"],
    nextActions: ["prepare_cart", "revise_plan"],
  };
}

describe("pure TaskCoordinator rules", () => {
  it("returns the same new-task decision for the same explicit identity", () => {
    const coordinator = new TaskCoordinator();
    const taskId = "11111111-1111-4111-8111-111111111111";
    const input = "4个人今晚做低脂三道菜，预算150元，不要太辣";

    const first = coordinator.resolveNewTask(taskId, input);
    const second = coordinator.resolveNewTask(taskId, input);

    expect(second).toEqual(first);
    expect(first.next).toMatchObject({
      taskId,
      domain: "commerce",
      phase: "searching_catalog",
      context: {
        peopleCount: 4,
        budgetCents: 15_000,
        dietaryRequirements: ["低脂", "不辣"],
      },
      allowedCapabilities: [
        "commerce.catalog.meal-search",
        "task.plan.submit",
      ],
    });
  });

  it("grants actual search and submit capabilities for a re-search", () => {
    const decision = new TaskCoordinator().resolveContinuation(
      existingTask(),
      "不要牛奶，重新搜豆奶",
    );

    expect(decision).toMatchObject({
      invalidatePlan: true,
      invalidateConfirmations: true,
      next: {
        version: 7,
        goal: "revise_plan",
        phase: "searching_catalog",
        allowedCapabilities: [
          "commerce.catalog.meal-search",
          "task.plan.submit",
        ],
        nextActions: [
          "search_catalog",
          "revise_plan",
          "start_new_task",
        ],
      },
    });
  });

  it("allows quantity-only edits to submit without provider search", () => {
    const decision = new TaskCoordinator().resolveContinuation(
      existingTask(),
      "鲜牛奶改成2瓶",
    );

    expect(decision).toMatchObject({
      invalidatePlan: false,
      invalidateConfirmations: true,
      next: {
        version: 7,
        goal: "revise_plan",
        phase: "editing_plan",
        allowedCapabilities: ["task.plan.submit"],
        context: {
          requirements: expect.arrayContaining(["鲜牛奶改成2瓶"]),
          selectedProducts: [
            { productId: "milk-1", quantity: 1 },
          ],
        },
      },
    });
  });

  it("rejects illegal transitions without reading stored state", () => {
    expect(() => new TaskCoordinator().transition(
      existingTask(),
      "creating_order",
    )).toThrow(/illegal task transition/i);
  });
});
