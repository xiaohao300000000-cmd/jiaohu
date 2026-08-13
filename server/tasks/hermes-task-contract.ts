import type { TaskCapability, TaskSnapshot } from "../../src/domain/task-contract";

const TOOL_BY_CAPABILITY: Partial<Record<TaskCapability, string>> = {
  "commerce.catalog.search": "pupu_search_catalog",
  "commerce.catalog.meal-search": "pupu_search_meal_catalog",
  "commerce.cart.read": "pupu_read_cart",
};

const PUPU_READ_TOOLS = [
  "pupu_search_catalog",
  "pupu_search_meal_catalog",
  "pupu_read_cart",
] as const;

export function buildHermesTaskContract(task: TaskSnapshot): string {
  const tools = task.allowedCapabilities
    .map((capability) => TOOL_BY_CAPABILITY[capability])
    .filter((tool): tool is string => Boolean(tool));
  if (tools.length === 0) return task.requestText;
  if (tools.length !== 1) {
    throw new Error("task must allow exactly one Hermes provider tool");
  }

  const tool = tools[0];
  const lines = [
    task.requestText,
    "",
    "[LIQUIDJOURNEY_TASK_CONTRACT]",
    `Task: ${task.taskId} version ${task.version}.`,
    `Call ${tool} exactly once.`,
    ...PUPU_READ_TOOLS
      .filter((candidate) => candidate !== tool)
      .map((candidate) => `Do not call ${candidate}.`),
    "Do not call pupu_auth_status or pupu_capabilities.",
    "After the tool result, answer only from the returned live data.",
  ];
  if (tool === "pupu_search_meal_catalog") {
    lines.push(
      "Produce exactly three simple dishes grounded in returned in-stock SKUs, with nutrition coverage and substitutions.",
      "Never return a prose-only or zero-price plan.",
    );
  }
  return lines.join("\n");
}
