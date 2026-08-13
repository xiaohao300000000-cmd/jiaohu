export type PresentationMode = "anchored" | "canvas" | "sheet";

export type DemoTaskKind =
  | "parcel"
  | "delivery"
  | "weather"
  | "pupu_order"
  | "pupu_purchase"
  | "plan"
  | "approval";

export interface TaskPresentation {
  mode: PresentationMode;
  kind: DemoTaskKind;
  input: string;
}

const riskPattern = /退款|付款|支付|扣款|提交.*订单|下单/;

const quickPatterns: Array<[RegExp, DemoTaskKind]> = [
  [/朴朴.*订单|订单.*朴朴/, "pupu_order"],
  [/快递|包裹|物流/, "parcel"],
  [/外卖|骑手|配送进度/, "delivery"],
  [/天气|下雨|温度/, "weather"],
];

const pupuPurchasePattern =
  /朴朴帮我买|朴朴.*(买|采购)|采购方案|(?:买|找|搜|看看|查看).*(牛奶|鸡蛋|食材|水果|蔬菜)|火锅.*预算|预算.*火锅|(?:做|吃).*(?:低脂|三道菜|营养全面)|(?:低脂|三道菜).*(?:菜|晚餐|营养)/;

export function resolveDemoPresentation(input: string): TaskPresentation {
  const normalized = input.trim();

  if (riskPattern.test(normalized)) {
    return { mode: "sheet", kind: "approval", input: normalized };
  }

  const quick = quickPatterns.find(([pattern]) => pattern.test(normalized));
  if (quick) {
    return { mode: "anchored", kind: quick[1], input: normalized };
  }

  if (pupuPurchasePattern.test(normalized)) {
    return { mode: "canvas", kind: "pupu_purchase", input: normalized };
  }

  return { mode: "canvas", kind: "plan", input: normalized };
}
export function isPupuTask(input: string): boolean {
  const normalized = input.trim();
  if (/(?:pupu|朴朴)/i.test(normalized)) return true;
  const kind = resolveDemoPresentation(normalized).kind;
  return kind === "pupu_order" || kind === "pupu_purchase";
}
