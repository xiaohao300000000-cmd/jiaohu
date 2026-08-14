import type {
  TaskAction,
  TaskCapability,
  TaskContext,
  TaskPhase,
  TaskSnapshot,
} from "../../src/domain/task-contract";
import type { TaskProposal } from "./task-proposal";

export interface TaskDecision {
  next: TaskSnapshot;
  invalidatePlan: boolean;
  invalidateConfirmations: boolean;
}

const LEGAL_TRANSITIONS: Record<TaskPhase, TaskPhase[]> = {
  advising: ["completed", "awaiting_login", "awaiting_address"],
  awaiting_login: ["awaiting_address", "searching_catalog", "advising", "blocked"],
  awaiting_address: ["searching_catalog", "advising", "blocked"],
  searching_catalog: [
    "awaiting_login",
    "awaiting_address",
    "awaiting_cart_confirmation",
    "editing_plan",
    "blocked",
  ],
  editing_plan: [
    "awaiting_login",
    "awaiting_address",
    "searching_catalog",
    "awaiting_cart_confirmation",
    "blocked",
  ],
  awaiting_cart_confirmation: ["editing_plan", "writing_cart", "blocked"],
  writing_cart: ["awaiting_order_confirmation", "blocked"],
  awaiting_order_confirmation: ["editing_plan", "creating_order", "blocked"],
  creating_order: ["awaiting_payment", "blocked"],
  awaiting_payment: ["completed", "blocked"],
  completed: [],
  blocked: ["editing_plan", "awaiting_cart_confirmation", "awaiting_order_confirmation"],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function policyFor(
  phase: TaskPhase,
  requested: TaskCapability[],
): {
  allowedCapabilities: TaskCapability[];
  nextActions: TaskAction[];
} {
  if (phase === "advising") {
    return requested.includes("commerce.cart.read")
      ? {
          allowedCapabilities: ["commerce.cart.read"],
          nextActions: ["answer", "start_new_task"],
        }
      : { allowedCapabilities: [], nextActions: ["answer", "start_new_task"] };
  }
  if (phase === "searching_catalog") {
    const search = requested.filter(
      (capability) =>
        capability === "commerce.catalog.search" ||
        capability === "commerce.catalog.meal-search",
    );
    return {
      allowedCapabilities: unique([...search, "task.plan.submit" as const]),
      nextActions: ["search_catalog", "revise_plan", "start_new_task"],
    };
  }
  if (phase === "editing_plan") {
    return {
      allowedCapabilities: ["task.plan.submit"],
      nextActions: ["revise_plan", "start_new_task"],
    };
  }
  if (phase === "awaiting_cart_confirmation") {
    return {
      allowedCapabilities: ["commerce.cart.prepare"],
      nextActions: ["prepare_cart", "revise_plan"],
    };
  }
  if (phase === "writing_cart") {
    return {
      allowedCapabilities: ["commerce.cart.write"],
      nextActions: ["confirm_cart"],
    };
  }
  if (phase === "awaiting_order_confirmation") {
    return {
      allowedCapabilities: ["commerce.checkout.preview"],
      nextActions: ["preview_checkout", "revise_plan"],
    };
  }
  if (phase === "creating_order") {
    return {
      allowedCapabilities: ["commerce.order.create"],
      nextActions: ["confirm_order"],
    };
  }
  if (phase === "awaiting_payment") {
    return {
      allowedCapabilities: ["commerce.payment.read"],
      nextActions: ["open_payment"],
    };
  }
  if (phase === "awaiting_login") {
    return { allowedCapabilities: [], nextActions: ["login_pupu"] };
  }
  if (phase === "awaiting_address") {
    return { allowedCapabilities: [], nextActions: ["select_address"] };
  }
  if (phase === "blocked") {
    return { allowedCapabilities: [], nextActions: ["retry", "start_new_task"] };
  }
  return { allowedCapabilities: [], nextActions: ["start_new_task"] };
}

function phaseFor(
  proposal: TaskProposal,
  current?: TaskSnapshot,
): TaskPhase {
  if (proposal.operation === "research") return "searching_catalog";
  if (proposal.operation === "revise") return "editing_plan";
  if (
    proposal.requestedCapabilities.some(
      (capability) =>
        capability === "commerce.catalog.search" ||
        capability === "commerce.catalog.meal-search",
    )
  ) {
    return "searching_catalog";
  }
  if (current && proposal.operation === "continue") return current.phase;
  return "advising";
}

function contextFor(
  proposal: TaskProposal,
  current?: TaskSnapshot,
): TaskContext {
  const patch = proposal.contextPatch;
  const context: TaskContext = current
    ? clone(current.context)
    : {
        dietaryRequirements: [],
        requirements: [],
        selectedProducts: [],
      };
  if (patch.peopleCount !== undefined) context.peopleCount = patch.peopleCount;
  if (patch.budgetCents !== undefined) context.budgetCents = patch.budgetCents;
  if (patch.dietaryRequirements !== undefined) {
    context.dietaryRequirements = unique(patch.dietaryRequirements);
  }
  if (patch.requirementsToAdd !== undefined) {
    context.requirements = unique([
      ...context.requirements,
      ...patch.requirementsToAdd,
    ]);
  }
  return context;
}

function snapshot(
  taskId: string,
  version: number,
  input: string,
  proposal: TaskProposal,
  context: TaskContext,
  current?: TaskSnapshot,
): TaskSnapshot {
  const phase = phaseFor(proposal, current);
  const policy = policyFor(phase, proposal.requestedCapabilities);
  return {
    taskId,
    version,
    requestText: input,
    domain: proposal.domain,
    goal: proposal.goal,
    phase,
    context,
    ...(current?.finalPlan ? { finalPlan: clone(current.finalPlan) } : {}),
    requestedCapabilities: clone(proposal.requestedCapabilities),
    allowedCapabilities: policy.allowedCapabilities,
    nextActions: policy.nextActions,
  };
}

export class TaskConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskConflictError";
  }
}

export class TaskCoordinator {
  acceptNewTask(
    taskId: string,
    input: string,
    proposal: TaskProposal,
  ): TaskDecision {
    if (proposal.operation !== "start") {
      throw new TaskConflictError("new task requires a start proposal");
    }
    const next = snapshot(
      taskId,
      1,
      input,
      proposal,
      contextFor(proposal),
    );
    return {
      next,
      invalidatePlan: false,
      invalidateConfirmations: false,
    };
  }

  acceptProposal(
    current: TaskSnapshot,
    input: string,
    proposal: TaskProposal,
  ): TaskDecision {
    if (proposal.operation === "start") {
      throw new TaskConflictError("continuation cannot start a new task");
    }
    const invalidatePlan = proposal.operation === "research";
    const invalidateConfirmations =
      invalidatePlan || proposal.operation === "revise";
    const context = contextFor(proposal, current);
    if (invalidatePlan) context.selectedProducts = [];
    if (invalidateConfirmations) {
      delete context.cartPreview;
      delete context.checkoutPreview;
    }
    const next = snapshot(
      current.taskId,
      current.version,
      input,
      proposal,
      context,
      invalidatePlan ? undefined : current,
    );
    return { next, invalidatePlan, invalidateConfirmations };
  }

  transition(current: TaskSnapshot, phase: TaskPhase): TaskDecision {
    if (!LEGAL_TRANSITIONS[current.phase].includes(phase)) {
      throw new TaskConflictError(
        `illegal task transition: ${current.phase} -> ${phase}`,
      );
    }
    const policy = policyFor(phase, current.requestedCapabilities);
    return {
      next: {
        ...clone(current),
        phase,
        allowedCapabilities: policy.allowedCapabilities,
        nextActions: policy.nextActions,
      },
      invalidatePlan: false,
      invalidateConfirmations: false,
    };
  }

  assertPhase(current: TaskSnapshot, phase: TaskPhase): TaskSnapshot {
    if (current.phase !== phase) {
      throw new TaskConflictError("task phase conflict");
    }
    return clone(current);
  }
}
