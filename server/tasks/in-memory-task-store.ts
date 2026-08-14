import type {
  TaskConfirmation,
  TaskPhase,
  TaskProduct,
  TaskSnapshot,
} from "../../src/domain/task-contract";
import {
  TaskConflictError,
  TaskCoordinator,
} from "./task-coordinator";

interface Options {
  createId?: () => string;
}
function legacyProposal(
  input: string,
  current?: TaskSnapshot,
): import("./task-proposal").TaskProposal {
  const search = /买|找|搜|牛奶|鸡蛋|食材|低脂|晚餐/u.test(input);
  const cartRead = /购物车/u.test(input);
  const meal = /低脂|晚餐|三道菜/u.test(input);
  const research = /重新搜|再搜|换成|替换|不要/u.test(input);
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

export class InMemoryTaskStore {
  readonly #tasks = new Map<string, TaskSnapshot>();
  readonly #createId: () => string;
  readonly #rules = new TaskCoordinator();

  constructor(options: Options = {}) {
    this.#createId =
      options.createId ?? (() => `task-${crypto.randomUUID()}`);
  }

  resolve(input: { input: string; taskId?: string }): TaskSnapshot {
    const current = input.taskId
      ? this.#required(input.taskId)
      : undefined;
    const decision = current
      ? this.#rules.acceptProposal(current, input.input, legacyProposal(input.input, current))
      : this.#rules.acceptNewTask(this.#createId(), input.input, legacyProposal(input.input));
    return this.#save(decision.next, current);
  }

  resume(taskId: string): TaskSnapshot {
    return this.#required(taskId);
  }

  assertPhase(
    taskId: string,
    expectedVersion: number,
    phase: TaskPhase,
  ): TaskSnapshot {
    return this.#rules.assertPhase(
      this.#versioned(taskId, expectedVersion),
      phase,
    );
  }

  transition(
    taskId: string,
    expectedVersion: number,
    phase: TaskPhase,
  ): TaskSnapshot {
    const current = this.#versioned(taskId, expectedVersion);
    return this.#save(
      this.#rules.transition(current, phase).next,
      current,
    );
  }

  attachProducts(
    taskId: string,
    expectedVersion: number,
    products: TaskProduct[],
  ): TaskSnapshot {
    const current = this.#versioned(taskId, expectedVersion);
    if (
      current.phase !== "searching_catalog" &&
      current.phase !== "editing_plan"
    ) {
      throw new TaskConflictError(
        "task is not accepting product results",
      );
    }
    const next = this.#rules.transition(
      current,
      "awaiting_cart_confirmation",
    ).next;
    return this.#save({
      ...next,
      context: {
        ...next.context,
        selectedProducts: structuredClone(products),
        cartPreview: undefined,
        checkoutPreview: undefined,
      },
    }, current);
  }

  bindConfirmation(
    taskId: string,
    expectedVersion: number,
    kind: "cart" | "checkout",
    confirmation: TaskConfirmation,
  ): TaskSnapshot {
    const current = this.#versioned(taskId, expectedVersion);
    if (
      kind === "cart" &&
      current.phase !== "awaiting_cart_confirmation"
    ) {
      throw new TaskConflictError(
        "cart confirmation is not allowed in this phase",
      );
    }
    if (
      kind === "checkout" &&
      current.phase !== "awaiting_order_confirmation"
    ) {
      throw new TaskConflictError(
        "checkout confirmation is not allowed in this phase",
      );
    }
    return this.#save({
      ...current,
      context: {
        ...current.context,
        ...(kind === "cart"
          ? {
              cartPreview: structuredClone(confirmation),
              checkoutPreview: undefined,
            }
          : { checkoutPreview: structuredClone(confirmation) }),
      },
    }, current);
  }

  #save(
    candidate: TaskSnapshot,
    current?: TaskSnapshot,
  ): TaskSnapshot {
    const next = {
      ...structuredClone(candidate),
      version: current ? current.version + 1 : candidate.version,
    };
    this.#tasks.set(next.taskId, next);
    return structuredClone(next);
  }

  #versioned(
    taskId: string,
    expectedVersion: number,
  ): TaskSnapshot {
    const task = this.#required(taskId);
    if (task.version !== expectedVersion) {
      throw new TaskConflictError("task version conflict");
    }
    return task;
  }

  #required(taskId: string): TaskSnapshot {
    const task = this.#tasks.get(taskId);
    if (!task) throw new TaskConflictError("task was not found");
    return structuredClone(task);
  }
}
