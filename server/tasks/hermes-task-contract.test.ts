import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../src/domain/task-contract";
import { buildHermesTaskContract } from "./hermes-task-contract";

function task(capability?: TaskSnapshot["allowedCapabilities"][number]): TaskSnapshot {
  return {
    taskId: "task-1",
    version: 1,
    requestText: "帮我找牛奶",
    domain: capability ? "commerce" : "general",
    goal: capability ? "find_products" : "advice",
    phase: capability ? "searching_catalog" : "advising",
    context: {
      dietaryRequirements: [],
      requirements: ["帮我找牛奶"],
      selectedProducts: [],
    },
    requestedCapabilities: capability ? [capability] : [],
    allowedCapabilities: capability ? [capability] : [],
    nextActions: ["answer"],
  };
}

describe("buildHermesTaskContract", () => {
  it("leaves ordinary advice free of provider instructions", () => {
    expect(buildHermesTaskContract(task())).toBe("帮我找牛奶");
  });

  it.each([
    ["commerce.catalog.search", "pupu_search_catalog"],
    ["commerce.catalog.meal-search", "pupu_search_meal_catalog"],
    ["commerce.cart.read", "pupu_read_cart"],
  ] as const)("maps %s to exactly %s", (capability, tool) => {
    const prompt = buildHermesTaskContract(task(capability));
    expect(prompt).toContain(`Call ${tool} exactly once`);
    for (const other of ["pupu_search_catalog", "pupu_search_meal_catalog", "pupu_read_cart"]) {
      if (other !== tool) expect(prompt).toContain(`Do not call ${other}`);
    }
  });

  it("does not infer a tool from request text when the task allows none", () => {
    const snapshot = task();
    snapshot.domain = "commerce";
    snapshot.requestText = "查看朴朴购物车";
    expect(buildHermesTaskContract(snapshot)).toBe("查看朴朴购物车");
  });

  it("serializes safe task context and requires structured plan submission", () => {
    const snapshot = task("commerce.catalog.search");
    snapshot.allowedCapabilities = [
      "commerce.catalog.search",
      "task.plan.submit",
    ];
    snapshot.context.peopleCount = 3;
    snapshot.context.budgetCents = 12_000;
    snapshot.context.dietaryRequirements = ["低脂"];
    snapshot.finalPlan = {
      planId: "plan-1",
      version: 2,
      title: "当前方案",
      explanation: "当前说明",
      totalCents: 8_800,
      currency: "CNY",
    };

    const prompt = buildHermesTaskContract(snapshot);

    expect(prompt).toContain("[LIQUIDJOURNEY_TASK_CONTEXT]");
    expect(prompt).toContain('"peopleCount":3');
    expect(prompt).toContain('"budgetCents":12000');
    expect(prompt).toContain('"dietaryRequirements":["低脂"]');
    expect(prompt).toContain('"planId":"plan-1"');
    expect(prompt).toContain(
      "Call pupu_search_catalog exactly once, then call submit_final_plan exactly once.",
    );
  });

  it("allows a quantity-only edit to submit without searching", () => {
    const snapshot = task();
    snapshot.domain = "commerce";
    snapshot.goal = "revise_plan";
    snapshot.phase = "editing_plan";
    snapshot.allowedCapabilities = ["task.plan.submit"];

    const prompt = buildHermesTaskContract(snapshot);

    expect(prompt).toContain("Call submit_final_plan exactly once.");
    expect(prompt).toContain("Do not call pupu_search_catalog.");
    expect(prompt).toContain("Do not call pupu_search_meal_catalog.");
  });
});
