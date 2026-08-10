import { z } from "zod";
import type {
  AgentUIEvent,
  PupuPurchasePayload,
  ProductSummary,
} from "../components/agent/agent-ui-event";
import type {
  JourneyEvent,
  JourneyResult,
  TraceEntry,
} from "../components/journey/types";

const normalizedSkuSchema = z
  .object({
    store_product_id: z.string().min(1),
    product_id: z.string().min(1),
    name: z.string().min(1),
    price_cents: z.number().int().nonnegative(),
    origin_price_cents: z.number().int().nonnegative().nullable().optional(),
    unit: z.string().nullable().optional(),
    in_stock: z.boolean(),
    tags: z.array(z.string()).default([]),
    nutrition: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

const cliEnvelopeSchema = z
  .object({
    schema_version: z.string(),
    ok: z.boolean(),
    operation: z.string(),
    request_id: z.string(),
    household_id: z.string().nullable(),
    status: z.string(),
    data: z.unknown().nullable(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        retryable: z.boolean().optional(),
      })
      .passthrough()
      .nullable(),
    next_actions: z.array(z.string()),
    evidence_ref: z.string().nullable(),
  })
  .passthrough();

export type HermesRunEvent =
  | { type: "run.started"; run_id: string }
  | {
      type: "tool.started";
      run_id: string;
      tool_name: string;
      tool_call_id: string;
    }
  | {
      type: "tool.completed";
      run_id: string;
      tool_name: string;
      tool_call_id: string;
      output: unknown;
    }
  | {
      type: "run.completed";
      run_id: string;
      output?: { summary?: string } | null;
    }
  | { type: "run.failed"; run_id: string; error?: unknown }
  | { type: "run.cancelled"; run_id: string };

export interface HermesEventContext {
  requestId: string;
  requestText: string;
  runId: string;
  trace: TraceEntry[];
  products: ProductSummary[];
}

const toolPresentation: Record<
  string,
  { label: string; detail: string }
> = {
  pupu_capabilities: {
    label: "检查朴朴能力",
    detail: "正在确认只读能力边界",
  },
  pupu_auth_status: {
    label: "检查朴朴登录状态",
    detail: "正在读取当前账号状态",
  },
  pupu_search_catalog: {
    label: "搜索朴朴商品",
    detail: "正在读取实时商品信息",
  },
  pupu_get_product: {
    label: "读取商品详情",
    detail: "正在核对实时商品详情",
  },
  pupu_read_cart: {
    label: "读取朴朴购物车",
    detail: "正在读取购物车，不会进行修改",
  },
};

export function createHermesEventContext(
  requestId: string,
  requestText: string,
  runId: string,
): HermesEventContext {
  return { requestId, requestText, runId, trace: [], products: [] };
}

function extractItems(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (
    data !== null &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray((data as { items: unknown }).items)
  ) {
    return (data as { items: unknown[] }).items;
  }
  return null;
}

function toProduct(input: z.infer<typeof normalizedSkuSchema>): ProductSummary {
  return {
    productId: input.store_product_id,
    name: input.name,
    specification: input.unit || "规格以朴朴实时信息为准",
    unitPrice: input.price_cents / 100,
    quantity: 1,
    currency: "CNY",
    stockStatus: input.in_stock ? "in_stock" : "out_of_stock",
    collectedAt: new Date().toISOString(),
  };
}

function journeyResult(
  products: ProductSummary[],
  summary?: string,
): JourneyResult {
  const totalAmount = products.reduce(
    (sum, product) => sum + product.unitPrice * product.quantity,
    0,
  );
  return {
    title: "朴朴实时方案",
    summary:
      summary ||
      (products.length > 0
        ? `已找到 ${products.length} 件实时商品`
        : "实时查询已完成"),
    totalAmount,
    currency: "CNY",
    items: products.map((product) => ({
      id: product.productId,
      name: product.name,
      detail: product.specification,
      price: product.unitPrice * product.quantity,
    })),
  };
}

function safeReference(error: unknown): string | undefined {
  if (
    error !== null &&
    typeof error === "object" &&
    "reference" in error &&
    typeof (error as { reference: unknown }).reference === "string"
  ) {
    return (error as { reference: string }).reference;
  }
  return undefined;
}


function safeErrorKind(error: unknown): "provider" | "invalid_result" {
  if (
    error !== null &&
    typeof error === "object" &&
    "kind" in error &&
    (error as { kind: unknown }).kind === "invalid_result"
  ) {
    return "invalid_result";
  }
  return "provider";
}
function invalidResult(requestId: string): JourneyEvent {
  return {
    type: "stream.failed",
    requestId,
    error: {
      kind: "invalid_result",
      message: "实时商品数据格式不正确。",
    },
  };
}

function mapPupuOutput(
  event: Extract<HermesRunEvent, { type: "tool.completed" }>,
  context: HermesEventContext,
): JourneyEvent | AgentUIEvent<PupuPurchasePayload> {
  let rawOutput = event.output;
  if (typeof rawOutput === "string") {
    try {
      rawOutput = JSON.parse(rawOutput);
    } catch {
      return invalidResult(context.requestId);
    }
  }

  const envelope = cliEnvelopeSchema.safeParse(rawOutput);
  if (!envelope.success) return invalidResult(context.requestId);
  const authRequired = envelope.data.status === "auth_required";
  if (authRequired || !envelope.data.ok) {
    return {
      type: "stream.failed",
      requestId: context.requestId,
      error: {
        kind: "provider",
        message: authRequired
          ? "朴朴登录状态已失效，需要先恢复真实登录态。"
          : "朴朴实时服务返回失败，请稍后重试。",
        reference: envelope.data.request_id,
      },
    };
  }

  if (
    event.tool_name !== "pupu_search_catalog" &&
    event.tool_name !== "pupu_get_product" &&
    event.tool_name !== "pupu_read_cart"
  ) {
    return {
      type: "trace.updated",
      requestId: context.requestId,
      entries: context.trace,
    };
  }

  const items = extractItems(envelope.data.data);
  if (items === null) return invalidResult(context.requestId);
  const parsedProducts = z.array(normalizedSkuSchema).safeParse(items);
  if (!parsedProducts.success) return invalidResult(context.requestId);

  const products = parsedProducts.data.map(toProduct);
  context.products = products;
  const total = products.reduce(
    (sum, product) => sum + product.unitPrice * product.quantity,
    0,
  );
  const occurredAt = new Date().toISOString();
  return {
    runId: context.runId,
    capability: "pupu",
    intent: "pupu.readonly_plan",
    presentationMode: "canvas",
    component: "pupu.purchase-plan",
    state: "assembling",
    dataSource: "live",
    payload: {
      stage: "cart_ready",
      title: "朴朴实时商品方案",
      summary: `根据“${context.requestText}”读取了 ${products.length} 件实时商品。`,
      meal: "按需采购",
      people: 1,
      budget: total,
      constraints: ["仅使用实时数据", "首版只读，不修改购物车"],
      decisionSummary: "商品、价格与库存均来自本次朴朴 CLI 实时读取。",
      products,
      total,
      currency: "CNY",
      cartVersion: 0,
      estimatedDelivery: "以朴朴实时页面为准",
    },
    occurredAt,
  };
}

export function mapHermesEvent(
  event: HermesRunEvent,
  context: HermesEventContext,
): JourneyEvent | AgentUIEvent<PupuPurchasePayload> | null {
  switch (event.type) {
    case "run.started":
      return { type: "stream.started", requestId: context.requestId };
    case "tool.started": {
      const presentation = toolPresentation[event.tool_name] || {
        label: "执行只读工具",
        detail: "正在读取实时数据",
      };
      context.trace = [
        ...context.trace.map((entry) => ({ ...entry, status: "complete" as const })),
        {
          id: event.tool_call_id,
          label: presentation.label,
          detail: presentation.detail,
          status: "active",
        },
      ];
      return {
        type: "trace.updated",
        requestId: context.requestId,
        entries: context.trace,
      };
    }
    case "tool.completed": {
      context.trace = context.trace.map((entry) =>
        entry.id === event.tool_call_id
          ? { ...entry, status: "complete" as const }
          : entry,
      );
      if (event.tool_name.startsWith("pupu_")) {
        return mapPupuOutput(event, context);
      }
      return {
        type: "trace.updated",
        requestId: context.requestId,
        entries: context.trace,
      };
    }
    case "run.completed":
      return {
        type: "stream.finished",
        requestId: context.requestId,
        result: journeyResult(context.products, event.output?.summary),
      };
    case "run.failed": {
      const kind = safeErrorKind(event.error);
      return {
        type: "stream.failed",
        requestId: context.requestId,
        error: {
          kind,
          message:
            kind === "invalid_result"
              ? "实时事件格式不正确。"
              : "实时服务暂时不可用，请稍后重试。",
          reference: safeReference(event.error),
        },
      };
    }
    case "run.cancelled":
      return {
        type: "stream.interrupted",
        requestId: context.requestId,
      };
    default:
      return null;
  }
}
