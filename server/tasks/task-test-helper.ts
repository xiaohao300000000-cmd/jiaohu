import type { TaskSnapshot } from "../../src/domain/task-contract";
import type { TaskProposal } from "./task-proposal";

export function testProposal(
  input: string,
  current?: TaskSnapshot,
): TaskProposal {
  const search = /买|找|搜|牛奶|鸡蛋|食材|低脂|晚餐/u.test(input);
  const cartRead = /购物车/u.test(input);
  const meal = /低脂|晚餐|三道菜/u.test(input);
  const research = /重新搜|再搜|换成|替换/u.test(input);
  const revise = /改成|改为|增加|减少|数量|预算.*改/u.test(input);
  const people = input.match(/(\d{1,2})\s*(?:个人|人)/u);
  const budget = input.match(/预算(?:改成|改为|为)?\s*(\d+)\s*元?/u);
  const dietaryRequirements = [
    ["低脂", /低脂/u],
    ["不辣", /不辣|不要太辣/u],
  ].filter(([, pattern]) => (pattern as RegExp).test(input))
    .map(([name]) => name as string);
  return {
    operation: current
      ? research
        ? "research"
        : revise
          ? "revise"
          : "continue"
      : "start",
    domain: search || cartRead || current?.domain === "commerce" ? "commerce" : "general",
    goal: current
      ? research || revise
        ? "revise_plan"
        : current.goal
      : search
        ? "find_products"
        : "advice",
    requestedCapabilities: cartRead
      ? ["commerce.cart.read"]
      : current?.domain === "commerce"
      ? current.requestedCapabilities
      : search
        ? [meal ? "commerce.catalog.meal-search" : "commerce.catalog.search"]
        : [],
    contextPatch: {
      ...(people ? { peopleCount: Number(people[1]) } : {}),
      ...(budget ? { budgetCents: Number(budget[1]) * 100 } : {}),
      ...(dietaryRequirements.length > 0 ? { dietaryRequirements } : {}),
      requirementsToAdd: [input],
    },
  };
}
