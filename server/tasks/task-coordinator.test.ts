import { describe, expect, it } from "vitest";
import {
  TaskConflictError,
  TaskCoordinator,
} from "./task-coordinator";

function coordinator() {
  let sequence = 0;
  return new TaskCoordinator({ createId: () => `task-${++sequence}` });
}

describe("TaskCoordinator", () => {
  it("routes ordinary advice without granting provider capabilities", () => {
    const task = coordinator().resolve({ input: "帮我安排今天晚上的学习计划" });

    expect(task).toMatchObject({
      taskId: "task-1",
      version: 1,
      domain: "general",
      goal: "advice",
      phase: "advising",
      allowedCapabilities: [],
    });
  });

  it("routes one real product request exactly once", () => {
    const task = coordinator().resolve({ input: "帮我看看大瓶的牛奶" });

    expect(task).toMatchObject({
      domain: "commerce",
      goal: "find_products",
      phase: "searching_catalog",
      allowedCapabilities: ["commerce.catalog.search"],
    });
  });

  it("selects the meal catalog capability for a constrained meal request", () => {
    const task = coordinator().resolve({
      input: "4个人今晚做低脂三道菜，预算150元，不要太辣",
    });

    expect(task).toMatchObject({
      domain: "commerce",
      goal: "find_products",
      allowedCapabilities: ["commerce.catalog.meal-search"],
      context: {
        peopleCount: 4,
        budgetCents: 15_000,
        dietaryRequirements: ["低脂", "不辣"],
      },
    });
  });

  it("routes a cart read as a read-only commerce request", () => {
    const task = coordinator().resolve({ input: "看看我现在的朴朴购物车" });

    expect(task).toMatchObject({
      domain: "commerce",
      goal: "advice",
      phase: "advising",
      allowedCapabilities: ["commerce.cart.read"],
    });
  });

  it("resumes a task without parsing or changing its version", () => {
    const tasks = coordinator();
    const created = tasks.resolve({ input: "买牛奶和鸡蛋，预算100元" });

    expect(tasks.resume(created.taskId)).toEqual(created);
  });

  it("keeps prior context when a continuation only changes one field", () => {
    const tasks = coordinator();
    const created = tasks.resolve({
      input: "3个人吃低脂晚餐，预算120元",
    });
    const continued = tasks.resolve({
      taskId: created.taskId,
      input: "预算改成150元",
    });

    expect(continued.version).toBe(2);
    expect(continued.context).toMatchObject({
      peopleCount: 3,
      budgetCents: 15_000,
      dietaryRequirements: ["低脂"],
    });
  });

  it("stores provider products then invalidates confirmations on quantity change", () => {
    const tasks = coordinator();
    const created = tasks.resolve({ input: "买鲜牛奶" });
    const planned = tasks.attachProducts(created.taskId, created.version, [{
      productId: "milk-1",
      providerProductId: "provider-milk-1",
      name: "鲜牛奶",
      quantity: 1,
      unitPriceCents: 1290,
      source: "pupu_live",
    }]);
    const confirmed = tasks.bindConfirmation(
      planned.taskId,
      planned.version,
      "cart",
      { id: "cart-preview-1", version: 1, expiresAt: "2026-08-14T18:00:00.000Z" },
    );

    const changed = tasks.resolve({
      taskId: confirmed.taskId,
      input: "鲜牛奶改成2瓶",
    });

    expect(changed).toMatchObject({
      goal: "revise_plan",
      phase: "editing_plan",
      context: {
        selectedProducts: [{ productId: "milk-1", quantity: 2 }],
      },
    });
    expect(changed.context.cartPreview).toBeUndefined();
    expect(changed.context.checkoutPreview).toBeUndefined();
  });

  it("rejects stale versions and illegal phase transitions", () => {
    const tasks = coordinator();
    const created = tasks.resolve({ input: "买牛奶" });

    expect(() => tasks.transition(
      created.taskId,
      created.version - 1,
      "awaiting_cart_confirmation",
    )).toThrow(TaskConflictError);
    expect(() => tasks.transition(
      created.taskId,
      created.version,
      "creating_order",
    )).toThrow(/illegal task transition/i);
  });
});
