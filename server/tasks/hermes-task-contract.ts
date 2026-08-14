import type {
  TaskCapability,
  TaskSnapshot,
} from "../../src/domain/task-contract";

const TOOL_BY_CAPABILITY: Partial<Record<TaskCapability, string>> = {
  "commerce.catalog.search": "pupu_search_catalog",
  "commerce.catalog.meal-search": "pupu_search_meal_catalog",
  "commerce.cart.read": "pupu_read_cart",
  "task.plan.submit": "submit_final_plan",
};

const PUPU_READ_TOOLS = [
  "pupu_search_catalog",
  "pupu_search_meal_catalog",
  "pupu_read_cart",
] as const;

function safeTaskContext(task: TaskSnapshot) {
  return {
    taskId: task.taskId,
    version: task.version,
    goal: task.goal,
    phase: task.phase,
    latestRequest: task.requestText,
    peopleCount: task.context.peopleCount,
    budgetCents: task.context.budgetCents,
    dietaryRequirements: task.context.dietaryRequirements,
    requirements: task.context.requirements,
    addressBound: Boolean(task.context.addressBinding),
    selectedProducts: task.context.selectedProducts,
    finalPlan: task.finalPlan,
    allowedCapabilities: task.allowedCapabilities,
  };
}

export function buildHermesTaskContract(task: TaskSnapshot): string {
  const tools = task.allowedCapabilities
    .map((capability) => TOOL_BY_CAPABILITY[capability])
    .filter((tool): tool is string => Boolean(tool));
  if (tools.length === 0) return task.requestText;

  const providerTools = tools.filter(
    (tool) => tool !== "submit_final_plan",
  );
  if (providerTools.length > 1) {
    throw new Error("task must allow at most one Hermes provider tool");
  }
  const providerTool = providerTools[0];
  const canSubmit = tools.includes("submit_final_plan");
  const lines = [
    task.requestText,
    "",
    "[LIQUIDJOURNEY_TASK_CONTEXT]",
    JSON.stringify(safeTaskContext(task)),
    "",
    "[LIQUIDJOURNEY_TASK_CONTRACT]",
    `Task: ${task.taskId} version ${task.version}.`,
  ];

  if (providerTool && canSubmit) {
    lines.push(
      `Call ${providerTool} exactly once, then call submit_final_plan exactly once.`,
      "A prose-only completion is invalid and must not create a final plan.",
    );
  } else if (providerTool) {
    lines.push(`Call ${providerTool} exactly once.`);
  } else if (canSubmit) {
    lines.push(
      "Call submit_final_plan exactly once.",
      "Use only candidate IDs already present in the current FinalPlan.",
    );
  }

  for (const candidate of PUPU_READ_TOOLS) {
    if (candidate !== providerTool) {
      lines.push(`Do not call ${candidate}.`);
    }
  }
  lines.push(
    "Do not call pupu_auth_status or pupu_capabilities.",
    "Never infer product identity, quantity, or price from natural-language summary text.",
    "After structured submission, use run.completed only for human-readable explanation.",
  );
  if (providerTool === "pupu_search_meal_catalog") {
    lines.push(
      "Select a nutritionally coherent plan grounded in returned in-stock candidate IDs.",
      "Never return a prose-only or zero-price plan.",
    );
  }
  return lines.join("\n");
}
