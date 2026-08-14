import type {
  TaskAction,
  TaskCapability,
  TaskContext,
  TaskGoal,
  TaskPhase,
  TaskSnapshot,
} from "../../src/domain/task-contract";

interface Route {
  domain: TaskSnapshot["domain"];
  goal: TaskGoal;
  phase: TaskPhase;
  requested: TaskCapability[];
}

export interface TaskDecision {
  next: TaskSnapshot;
  invalidatePlan: boolean;
  invalidateConfirmations: boolean;
}

const COMMERCE_PATTERN =
  /(?:pupu|朴朴|采购|购物车|买|找|搜|看看|查看).*(?:牛奶|鸡蛋|食材|水果|蔬菜|商品|购物车)|(?:牛奶|鸡蛋|食材|水果|蔬菜|豆奶).*(?:买|找|搜|看看|查看)|(?:低脂|三道菜|营养全面|晚餐|做.*菜)/i;
const MEAL_PATTERN = /(?:低脂|三道菜|营养全面|晚餐|做.*菜)/i;
const CART_READ_PATTERN =
  /(?:查看|看看|读取|现在|我的)?.*(?:朴朴)?.*(?:购物车|购车)/i;
const QUANTITY_OR_CONSTRAINT_PATTERN =
  /(?:改成|改为|增加|减少|数量|预算.*改)/i;
const RESEARCH_REVISION_PATTERN =
  /(?:重新搜|再搜|重搜|换成|替换|不要).*(?:商品|牛奶|鸡蛋|食材|水果|蔬菜|豆奶)?|(?:商品|牛奶|鸡蛋|食材|水果|蔬菜|豆奶).*(?:重新搜|再搜|换成|替换|不要)/i;
const NEW_DOMAIN_PATTERN =
  /(?:天气|下雨|快递|包裹|日历|日程|开灯|关灯|空调)/i;

const LEGAL_TRANSITIONS: Record<TaskPhase, TaskPhase[]> = {
  advising: ["completed", "awaiting_login", "awaiting_address"],
  awaiting_login: [
    "awaiting_address",
    "searching_catalog",
    "advising",
    "blocked",
  ],
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
  blocked: [
    "editing_plan",
    "awaiting_cart_confirmation",
    "awaiting_order_confirmation",
  ],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function contextFrom(input: string, previous?: TaskContext): TaskContext {
  const context: TaskContext = previous
    ? clone(previous)
    : {
        dietaryRequirements: [],
        requirements: [],
        selectedProducts: [],
      };
  const people = input.match(/(\d{1,2})\s*(?:个人|人)/u);
  if (people) context.peopleCount = Number(people[1]);
  const budget = input.match(
    /预算(?:改成|改为|调整为|为|是)?\s*(\d+(?:\.\d{1,2})?)\s*元?/u,
  );
  if (budget) {
    context.budgetCents = Math.round(Number(budget[1]) * 100);
  }
  const dietary = [
    ["低脂", /低脂/u],
    ["素食", /素食/u],
    ["无糖", /无糖|不加糖/u],
    ["不辣", /不辣|不要太辣/u],
    ["清真", /清真/u],
  ] as const;
  context.dietaryRequirements = unique([
    ...context.dietaryRequirements,
    ...dietary
      .filter(([, pattern]) => pattern.test(input))
      .map(([name]) => name),
  ]);
  context.requirements = unique([
    ...context.requirements,
    input.trim(),
  ]);
  return context;
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
      : {
          allowedCapabilities: [],
          nextActions: ["answer", "start_new_task"],
        };
  }
  if (phase === "searching_catalog") {
    const search = requested.filter(
      (capability) =>
        capability === "commerce.catalog.search" ||
        capability === "commerce.catalog.meal-search",
    );
    return {
      allowedCapabilities: unique([
        ...search,
        "task.plan.submit" as const,
      ]),
      nextActions: [
        "search_catalog",
        "revise_plan",
        "start_new_task",
      ],
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
    return {
      allowedCapabilities: [],
      nextActions: ["retry", "start_new_task"],
    };
  }
  return {
    allowedCapabilities: [],
    nextActions: ["start_new_task"],
  };
}

function classify(input: string): Route {
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
      requested: [
        MEAL_PATTERN.test(input)
          ? "commerce.catalog.meal-search"
          : "commerce.catalog.search",
      ],
    };
  }
  return {
    domain: "general",
    goal: "advice",
    phase: "advising",
    requested: [],
  };
}

function snapshot(input: {
  taskId: string;
  version: number;
  requestText: string;
  route: Route;
  context: TaskContext;
  previous?: TaskSnapshot;
}): TaskSnapshot {
  const policy = policyFor(input.route.phase, input.route.requested);
  return {
    taskId: input.taskId,
    version: input.version,
    requestText: input.requestText,
    domain: input.route.domain,
    goal: input.route.goal,
    phase: input.route.phase,
    context: input.context,
    ...(input.previous?.finalPlan
      ? { finalPlan: clone(input.previous.finalPlan) }
      : {}),
    requestedCapabilities: clone(input.route.requested),
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
  resolveNewTask(taskId: string, input: string): TaskDecision {
    const text = input.trim();
    if (!text) throw new TaskConflictError("task input is empty");
    const route = classify(text);
    return {
      next: snapshot({
        taskId,
        version: 1,
        requestText: text,
        route,
        context: contextFrom(text),
      }),
      invalidatePlan: false,
      invalidateConfirmations: false,
    };
  }

  resolveContinuation(
    current: TaskSnapshot,
    input: string,
  ): TaskDecision {
    const text = input.trim();
    if (!text) throw new TaskConflictError("task input is empty");
    let route = classify(text);
    let invalidatePlan = false;
    let invalidateConfirmations = false;

    if (current.domain === "commerce" && !NEW_DOMAIN_PATTERN.test(text)) {
      if (RESEARCH_REVISION_PATTERN.test(text)) {
        route = {
          domain: "commerce",
          goal: "revise_plan",
          phase: "searching_catalog",
          requested: clone(current.requestedCapabilities),
        };
        invalidatePlan = true;
        invalidateConfirmations = true;
      } else if (QUANTITY_OR_CONSTRAINT_PATTERN.test(text)) {
        route = {
          domain: "commerce",
          goal: "revise_plan",
          phase: "editing_plan",
          requested: clone(current.requestedCapabilities),
        };
        invalidateConfirmations = true;
      } else if (route.domain === "general") {
        route = {
          domain: current.domain,
          goal: current.goal,
          phase: current.phase,
          requested: clone(current.requestedCapabilities),
        };
      }
    }

    const context = contextFrom(text, current.context);
    if (invalidateConfirmations) {
      delete context.cartPreview;
      delete context.checkoutPreview;
    }
    if (invalidatePlan) {
      context.selectedProducts = [];
    }
    const next = snapshot({
      taskId: current.taskId,
      version: current.version,
      requestText: text,
      route,
      context,
      previous: invalidatePlan ? undefined : current,
    });
    return { next, invalidatePlan, invalidateConfirmations };
  }

  transition(
    current: TaskSnapshot,
    phase: TaskPhase,
  ): TaskDecision {
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

  assertPhase(
    current: TaskSnapshot,
    phase: TaskPhase,
  ): TaskSnapshot {
    if (current.phase !== phase) {
      throw new TaskConflictError("task phase conflict");
    }
    return clone(current);
  }
}
