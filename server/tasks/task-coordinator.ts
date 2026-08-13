import type {
  TaskAction,
  TaskCapability,
  TaskConfirmation,
  TaskContext,
  TaskGoal,
  TaskPhase,
  TaskProduct,
  TaskSnapshot,
} from "../../src/domain/task-contract";

interface TaskCoordinatorOptions {
  createId?: () => string;
}

interface ResolveTaskInput {
  input: string;
  taskId?: string;
}

const COMMERCE_PATTERN =
  /(?:pupu|朴朴|采购|购物车|买|找|搜|看看|查看).*(?:牛奶|鸡蛋|食材|水果|蔬菜|商品|购物车)|(?:牛奶|鸡蛋|食材|水果|蔬菜).*(?:买|找|搜|看看|查看)|(?:低脂|三道菜|营养全面|晚餐|做.*菜)/i;
const MEAL_PATTERN = /(?:低脂|三道菜|营养全面|晚餐|做.*菜)/i;
const CART_READ_PATTERN = /(?:查看|看看|读取|现在|我的)?.*(?:朴朴)?.*(?:购物车|购车)/i;
const REVISION_PATTERN = /(?:改成|改为|换成|不要|增加|减少|数量|预算.*改)/i;
const NEW_DOMAIN_PATTERN = /(?:天气|下雨|快递|包裹|日历|日程|开灯|关灯|空调)/i;

const LEGAL_TRANSITIONS: Record<TaskPhase, TaskPhase[]> = {
  advising: ["completed", "awaiting_login", "awaiting_address"],
  awaiting_login: ["awaiting_address", "searching_catalog", "advising", "blocked"],
  awaiting_address: ["searching_catalog", "advising", "blocked"],
  searching_catalog: ["awaiting_login", "awaiting_address", "awaiting_cart_confirmation", "editing_plan", "blocked"],
  editing_plan: ["awaiting_login", "awaiting_address", "searching_catalog", "awaiting_cart_confirmation", "blocked"],
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function contextFrom(input: string, previous?: TaskContext): TaskContext {
  const context: TaskContext = previous
    ? clone(previous)
    : { dietaryRequirements: [], requirements: [], selectedProducts: [] };
  const people = input.match(/(\d{1,2})\s*(?:个人|人)/u);
  if (people) context.peopleCount = Number(people[1]);
  const budget = input.match(/预算(?:改成|改为|调整为|为|是)?\s*(\d+(?:\.\d{1,2})?)\s*元?/u);
  if (budget) context.budgetCents = Math.round(Number(budget[1]) * 100);
  const dietary = [
    ["低脂", /低脂/u],
    ["素食", /素食/u],
    ["无糖", /无糖|不加糖/u],
    ["不辣", /不辣|不要太辣/u],
    ["清真", /清真/u],
  ] as const;
  context.dietaryRequirements = unique([
    ...context.dietaryRequirements,
    ...dietary.filter(([, pattern]) => pattern.test(input)).map(([name]) => name),
  ]);
  context.requirements = unique([...context.requirements, input.trim()]);
  return context;
}

function policyFor(
  phase: TaskPhase,
  requested: TaskCapability[],
): { allowed: TaskCapability[]; actions: TaskAction[] } {
  if (phase === "advising") {
    return requested.includes("commerce.cart.read")
      ? { allowed: ["commerce.cart.read"], actions: ["answer", "start_new_task"] }
      : { allowed: [], actions: ["answer", "start_new_task"] };
  }
  if (phase === "searching_catalog") {
    return { allowed: requested, actions: ["search_catalog", "start_new_task"] };
  }
  if (phase === "editing_plan") {
    return { allowed: [], actions: ["revise_plan", "search_catalog", "start_new_task"] };
  }
  if (phase === "awaiting_cart_confirmation") {
    return { allowed: ["commerce.cart.prepare"], actions: ["prepare_cart", "revise_plan"] };
  }
  if (phase === "writing_cart") {
    return { allowed: ["commerce.cart.write"], actions: ["confirm_cart"] };
  }
  if (phase === "awaiting_order_confirmation") {
    return { allowed: ["commerce.checkout.preview"], actions: ["preview_checkout", "revise_plan"] };
  }
  if (phase === "creating_order") {
    return { allowed: ["commerce.order.create"], actions: ["confirm_order"] };
  }
  if (phase === "awaiting_payment") {
    return { allowed: ["commerce.payment.read"], actions: ["open_payment"] };
  }
  if (phase === "awaiting_login") return { allowed: [], actions: ["login_pupu"] };
  if (phase === "awaiting_address") return { allowed: [], actions: ["select_address"] };
  if (phase === "blocked") return { allowed: [], actions: ["retry", "start_new_task"] };
  return { allowed: [], actions: ["start_new_task"] };
}

function classify(input: string): {
  goal: TaskGoal;
  phase: TaskPhase;
  requested: TaskCapability[];
  domain: TaskSnapshot["domain"];
} {
  if (CART_READ_PATTERN.test(input)) {
    return {
      domain: "commerce",
      goal: "advice",
      phase: "advising",
      requested: ["commerce.cart.read"],
    };
  }
  if (COMMERCE_PATTERN.test(input)) {
    return {
      domain: "commerce",
      goal: "find_products",
      phase: "searching_catalog",
      requested: [MEAL_PATTERN.test(input)
        ? "commerce.catalog.meal-search"
        : "commerce.catalog.search"],
    };
  }
  return { domain: "general", goal: "advice", phase: "advising", requested: [] };
}

export class TaskConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskConflictError";
  }
}

export class TaskCoordinator {
  readonly #tasks = new Map<string, TaskSnapshot>();
  readonly #createId: () => string;

  constructor(options: TaskCoordinatorOptions = {}) {
    this.#createId = options.createId ?? (() => `task-${crypto.randomUUID()}`);
  }

  resolve(input: ResolveTaskInput): TaskSnapshot {
    const text = input.input.trim();
    if (!text) throw new TaskConflictError("task input is empty");
    const previous = input.taskId ? this.#required(input.taskId) : undefined;
    let route = classify(text);
    if (previous?.domain === "commerce" && !NEW_DOMAIN_PATTERN.test(text)) {
      if (REVISION_PATTERN.test(text)) {
        route = {
          domain: "commerce",
          goal: "revise_plan",
          phase: "editing_plan",
          requested: previous.requestedCapabilities,
        };
      } else if (route.domain === "general") {
        route = {
          domain: previous.domain,
          goal: previous.goal,
          phase: previous.phase,
          requested: previous.requestedCapabilities,
        };
      }
    }
    const context = contextFrom(text, previous?.context);
    if (route.goal === "revise_plan") {
      const quantity = text.match(/(.{1,24}?)改成\s*(\d{1,2})\s*(?:瓶|盒|个|份|袋)?/u);
      if (quantity) {
        const requestedName = quantity[1].trim();
        const requestedQuantity = Number(quantity[2]);
        context.selectedProducts = context.selectedProducts.map((product) =>
          product.name.includes(requestedName) || requestedName.includes(product.name)
            ? { ...product, quantity: requestedQuantity }
            : product,
        );
      }
      delete context.cartPreview;
      delete context.checkoutPreview;
    }
    const policy = policyFor(route.phase, route.requested);
    const snapshot: TaskSnapshot = {
      taskId: previous?.taskId ?? this.#createId(),
      version: (previous?.version ?? 0) + 1,
      requestText: text,
      domain: route.domain,
      goal: route.goal,
      phase: route.phase,
      context,
      requestedCapabilities: route.requested,
      allowedCapabilities: policy.allowed,
      nextActions: policy.actions,
    };
    this.#tasks.set(snapshot.taskId, clone(snapshot));
    return clone(snapshot);
  }

  resume(taskId: string): TaskSnapshot {
    return clone(this.#required(taskId));
  }

  transition(taskId: string, expectedVersion: number, phase: TaskPhase): TaskSnapshot {
    const current = this.#versioned(taskId, expectedVersion);
    if (!LEGAL_TRANSITIONS[current.phase].includes(phase)) {
      throw new TaskConflictError(`illegal task transition: ${current.phase} -> ${phase}`);
    }
    return this.#replace(current, { phase });
  }

  attachProducts(
    taskId: string,
    expectedVersion: number,
    products: TaskProduct[],
  ): TaskSnapshot {
    const current = this.#versioned(taskId, expectedVersion);
    if (current.phase !== "searching_catalog" && current.phase !== "editing_plan") {
      throw new TaskConflictError("task is not accepting product results");
    }
    return this.#replace(current, {
      phase: "awaiting_cart_confirmation",
      context: {
        ...current.context,
        selectedProducts: clone(products),
        cartPreview: undefined,
        checkoutPreview: undefined,
      },
    });
  }

  bindConfirmation(
    taskId: string,
    expectedVersion: number,
    kind: "cart" | "checkout",
    confirmation: TaskConfirmation,
  ): TaskSnapshot {
    const current = this.#versioned(taskId, expectedVersion);
    if (kind === "cart" && current.phase !== "awaiting_cart_confirmation") {
      throw new TaskConflictError("cart confirmation is not allowed in this phase");
    }
    if (kind === "checkout" && current.phase !== "awaiting_order_confirmation") {
      throw new TaskConflictError("checkout confirmation is not allowed in this phase");
    }
    return this.#replace(current, {
      context: {
        ...current.context,
        ...(kind === "cart"
          ? { cartPreview: clone(confirmation), checkoutPreview: undefined }
          : { checkoutPreview: clone(confirmation) }),
      },
    });
  }

  #replace(
    current: TaskSnapshot,
    changes: Partial<Pick<TaskSnapshot, "phase" | "context">>,
  ): TaskSnapshot {
    const phase = changes.phase ?? current.phase;
    const policy = policyFor(phase, current.requestedCapabilities);
    const next: TaskSnapshot = {
      ...current,
      ...changes,
      version: current.version + 1,
      allowedCapabilities: policy.allowed,
      nextActions: policy.actions,
    };
    this.#tasks.set(next.taskId, clone(next));
    return clone(next);
  }

  #versioned(taskId: string, expectedVersion: number): TaskSnapshot {
    const task = this.#required(taskId);
    if (task.version !== expectedVersion) {
      throw new TaskConflictError("task version conflict");
    }
    return task;
  }

  #required(taskId: string): TaskSnapshot {
    const task = this.#tasks.get(taskId);
    if (!task) throw new TaskConflictError("task was not found");
    return clone(task);
  }
}
