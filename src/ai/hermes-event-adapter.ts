import { z } from "zod";
import type { ProductSummary } from "../components/agent/agent-ui-event";
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
  terminalFailure: boolean;
}

const toolPresentation: Record<string, { label: string; detail: string }> = {
  pupu_cli: {
    label: "执行 Pupu CLI",
    detail: "Hermes 正在调用 Pupu CLI",
  },
};

export function createHermesEventContext(
  requestId: string,
  requestText: string,
  runId: string,
): HermesEventContext {
  return {
    requestId,
    requestText,
    runId,
    trace: [],
    products: [],
    terminalFailure: false,
  };
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
function invalidResult(context: HermesEventContext): JourneyEvent {
  context.terminalFailure = true;
  return {
    type: "stream.failed",
    requestId: context.requestId,
    error: {
      kind: "invalid_result",
      message: "实时商品数据格式不正确。",
    },
  };
}

function mapPupuOutput(
  event: Extract<HermesRunEvent, { type: "tool.completed" }>,
  context: HermesEventContext,
): JourneyEvent {
  let rawOutput = event.output;
  if (typeof rawOutput === "string") {
    try {
      rawOutput = JSON.parse(rawOutput);
    } catch {
      return {
        type: "trace.updated",
        requestId: context.requestId,
        entries: context.trace,
      };
    }
  }

  const envelope = cliEnvelopeSchema.safeParse(rawOutput);
  if (!envelope.success) return invalidResult(context);
  const authRequired = envelope.data.status === "auth_required" ||
    envelope.data.error?.code === "auth_required";
  if (authRequired) {
    context.terminalFailure = true;
    return {
      type: "presentation.updated",
      requestId: context.requestId,
      presentation: {
        capability: "pupu",
        component: "pupu.login",
        mode: "canvas",
        dataSource: "live",
        payload: { phase: "phone" },
      },
    };
  }
  if (!envelope.data.ok) {
    context.terminalFailure = true;
    return {
      type: "stream.failed",
      requestId: context.requestId,
      error: {
        kind: "provider",
        message: "朴朴实时服务返回失败，请稍后重试。",
        reference: envelope.data.request_id,
      },
    };
  }

  const items = extractItems(envelope.data.data);
  if (items === null) {
    return {
      type: "trace.updated",
      requestId: context.requestId,
      entries: context.trace,
    };
  }
  const parsedProducts = z.array(normalizedSkuSchema).safeParse(items);
  if (!parsedProducts.success) return invalidResult(context);

  const products = parsedProducts.data.map(toProduct);
  context.products = products;
  const total = products.reduce(
    (sum, product) => sum + product.unitPrice * product.quantity,
    0,
  );
  return {
    type: "presentation.updated",
    requestId: context.requestId,
    presentation: {
      capability: "pupu",
      component: "pupu.purchase-plan",
      mode: "canvas",
      dataSource: "live",
      payload: {
        stage: "cart_ready",
        title: "朴朴实时商品方案",
        summary: `根据“${context.requestText}”读取了 ${products.length} 件实时商品。`,
        meal: "按需采购",
        people: 1,
        constraints: ["仅使用 Pupu CLI 返回数据"],
        decisionSummary: "商品、价格与库存均来自本次朴朴 CLI 实时读取。",
        products,
        estimatedTotal: total,
        currency: "CNY",
        cartVersion: 0,
        estimatedDelivery: "以朴朴实时页面为准",
      },
    },
  };
}

export function mapHermesEvent(
  event: HermesRunEvent,
  context: HermesEventContext,
): JourneyEvent | null {
  switch (event.type) {
    case "run.started":
      return {
        type: "stream.started",
        requestId: context.requestId,
        runId: context.runId,
      };
    case "tool.started": {
      const presentation = toolPresentation[event.tool_name] || {
        label: "执行 Hermes 工具",
        detail: event.tool_name,
      };
      context.trace = [
        ...context.trace.map((entry) => ({
          ...entry,
          status: "complete" as const,
        })),
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
      if (event.tool_name === "pupu_cli") {
        return mapPupuOutput(event, context);
      }
      return {
        type: "trace.updated",
        requestId: context.requestId,
        entries: context.trace,
      };
    }
    case "run.completed":
      if (context.terminalFailure) return null;
      return {
        type: "stream.finished",
        requestId: context.requestId,
        result: journeyResult(context.products, event.output?.summary),
      };
    case "run.failed": {
      context.terminalFailure = true;
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
