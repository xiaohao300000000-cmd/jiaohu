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
});
