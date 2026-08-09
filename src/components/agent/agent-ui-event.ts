import type { PresentationMode } from "../home/presentation";
import type { JourneyState } from "../journey/types";

export type AgentDataSource = "live" | "demo";

export type AgentCapability =
  | "pupu"
  | "parcel"
  | "delivery"
  | "weather"
  | "unknown";

export interface AgentUIEvent<TPayload> {
  runId: string;
  capability: AgentCapability;
  intent: string;
  presentationMode: PresentationMode;
  component: string;
  state: JourneyState;
  dataSource: AgentDataSource;
  payload: TPayload;
  occurredAt: string;
}

export interface ProductSummary {
  productId: string;
  name: string;
  specification: string;
  unitPrice: number;
  quantity: number;
  currency: "CNY";
  stockStatus: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  imageUrl?: string;
  collectedAt: string;
}

export interface PupuPurchasePayload {
  stage: "cart_ready" | "cart_updated";
  title: string;
  summary: string;
  meal: string;
  people: number;
  budget: number;
  constraints: string[];
  decisionSummary: string;
  products: ProductSummary[];
  total: number;
  currency: "CNY";
  cartVersion: number;
  estimatedDelivery: string;
}

export function createDemoPupuPurchaseEvent(
  input: string,
): AgentUIEvent<PupuPurchasePayload> {
  const occurredAt = new Date().toISOString();
  const products: ProductSummary[] = [
    {
      productId: "demo-beef-roll",
      name: "谷饲肥牛卷",
      specification: "250g · 1 盒",
      unitPrice: 29.9,
      quantity: 1,
      currency: "CNY",
      stockStatus: "in_stock",
      imageUrl:
        "https://images.unsplash.com/photo-1603048297172-c92544798d5a?auto=format&fit=crop&w=240&q=80",
      collectedAt: occurredAt,
    },
    {
      productId: "demo-mushroom-set",
      name: "鲜菌菇组合",
      specification: "400g · 1 份",
      unitPrice: 24.9,
      quantity: 1,
      currency: "CNY",
      stockStatus: "in_stock",
      imageUrl:
        "https://images.unsplash.com/photo-1504545102780-26774c1bb073?auto=format&fit=crop&w=240&q=80",
      collectedAt: occurredAt,
    },
    {
      productId: "demo-tomato-base",
      name: "番茄火锅底料",
      specification: "200g · 1 袋",
      unitPrice: 19.8,
      quantity: 1,
      currency: "CNY",
      stockStatus: "low_stock",
      imageUrl:
        "https://images.unsplash.com/photo-1561136594-7f68413baa99?auto=format&fit=crop&w=240&q=80",
      collectedAt: occurredAt,
    },
  ];

  return {
    runId: `demo-pupu-${Date.now()}`,
    capability: "pupu",
    intent: "pupu.purchase_plan",
    presentationMode: "canvas",
    component: "pupu.purchase-plan",
    state: "ready",
    dataSource: "demo",
    payload: {
      stage: "cart_ready",
      title: "今晚的火锅采购方案",
      summary: `根据“${input}”整理了 3 件核心食材，仍可继续补充或替换。`,
      meal: "火锅",
      people: 2,
      budget: 120,
      constraints: ["不辣", "不要香菜", "2人份"],
      decisionSummary: "优先保留肥牛和菌菇，用番茄锅底满足不辣要求；当前组合留有 ¥45.40 预算余量。",
      products,
      total: 74.6,
      currency: "CNY",
      cartVersion: 0,
      estimatedDelivery: "约 30 min",
    },
    occurredAt,
  };
}
