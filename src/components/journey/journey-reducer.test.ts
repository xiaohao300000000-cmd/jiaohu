import { describe, expect, it } from "vitest";
import { initialJourneySnapshot, journeyReducer } from "./journey-reducer";
import type {
  JourneyPresentation,
  JourneyResult,
  TraceEntry,
} from "./types";

const requestText = "今晚三个人吃火锅，微辣，200元以内。";

const trace: TraceEntry[] = [
  {
    id: "constraint-budget",
    label: "理解人数与预算",
    detail: "3 人 · 微辣 · 不超过 ¥200",
    status: "complete",
  },
];

const completeResult: JourneyResult = {
  title: "今晚的微辣火锅方案",
  summary: "荤素搭配，预计 30 分钟送达",
  totalAmount: 168.5,
  currency: "CNY",
  items: [
    {
      id: "beef-roll",
      name: "原切肥牛卷",
      detail: "350g · 冷鲜",
      price: 58,
    },
  ],
};

const livePupuPresentation: JourneyPresentation = {
  capability: "pupu",
  component: "pupu.purchase-plan",
  mode: "canvas",
  dataSource: "live",
  payload: {
    stage: "cart_ready",
    title: "朴朴实时商品方案",
    summary: "本次实时查询结果",
    meal: "按需采购",
    people: 1,
    constraints: ["仅使用实时数据"],
    decisionSummary: "来自朴朴实时读取。",
    products: [
      {
        productId: "store-1",
        name: "鲜牛奶",
        specification: "950ml",
        unitPrice: 12.9,
        quantity: 1,
        currency: "CNY",
        stockStatus: "in_stock",
        collectedAt: "2026-08-11T00:00:00.000Z",
      },
    ],
    estimatedTotal: 12.9,
    currency: "CNY",
    cartVersion: 0,
    estimatedDelivery: "以朴朴实时页面为准",
  },
};

describe("journeyReducer", () => {
  it("moves a normalized request through receiving, reasoning, assembling, and ready", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: requestText,
    });
    expect(receiving.state).toBe("receiving");

    const reasoning = journeyReducer(receiving, {
      type: "stream.started",
      requestId: "request-1",
      runId: "run-1",
    });
    expect(reasoning.state).toBe("reasoning");

    const withTrace = journeyReducer(reasoning, {
      type: "trace.updated",
      requestId: "request-1",
      entries: trace,
    });
    expect(withTrace.trace).toEqual(trace);

    const assembling = journeyReducer(withTrace, {
      type: "result.partial",
      requestId: "request-1",
      result: { title: completeResult.title, totalAmount: 168.5 },
    });
    expect(assembling.state).toBe("assembling");

    const ready = journeyReducer(assembling, {
      type: "stream.finished",
      requestId: "request-1",
      result: completeResult,
    });
    expect(ready.state).toBe("ready");
    expect(ready.result).toEqual(completeResult);
  });

  it("pauses for approval and resumes after either explicit response", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: requestText,
    });
    const awaiting = journeyReducer(receiving, {
      type: "approval.requested",
      requestId: "request-1",
      input: {
        kind: "approval",
        approvalId: "approval-1",
        title: "确认提交采购单",
        impact: "将创建一笔待支付订单",
        target: "朴朴超市 · 火锅清单",
        amount: 168.5,
        currency: "CNY",
      },
    });

    expect(awaiting.state).toBe("awaiting_input");
    expect(awaiting.awaitingInput?.kind).toBe("approval");

    const approved = journeyReducer(awaiting, {
      type: "approval.responded",
      requestId: "request-1",
      approved: true,
    });
    expect(approved.state).toBe("reasoning");
    expect(approved.awaitingInput).toBeNull();

    const denied = journeyReducer(awaiting, {
      type: "approval.responded",
      requestId: "request-1",
      approved: false,
    });
    expect(denied.state).toBe("reasoning");
    expect(denied.awaitingInput).toBeNull();
  });

  it("preserves the request when an error is retried under a new id", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: requestText,
    });
    const failed = journeyReducer(receiving, {
      type: "stream.failed",
      requestId: "request-1",
      error: {
        kind: "timeout",
        message: "本次连接等待时间过长",
        reference: "run_018",
      },
    });

    expect(failed.state).toBe("error");
    expect(failed.requestText).toBe(requestText);

    const retried = journeyReducer(failed, {
      type: "retry.requested",
      requestId: "request-2",
    });
    expect(retried.state).toBe("receiving");
    expect(retried.activeRequestId).toBe("request-2");
    expect(retried.requestText).toBe(requestText);
    expect(retried.error).toBeNull();
  });

  it("ignores late events from an interrupted request", () => {
    const first = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: requestText,
    });
    const interrupted = journeyReducer(first, {
      type: "stream.interrupted",
      requestId: "request-1",
      replacementRequestId: "request-2",
    });
    expect(interrupted.state).toBe("interrupted");

    const replacement = journeyReducer(interrupted, {
      type: "request.sent",
      requestId: "request-2",
      text: "改成两个人吃寿喜锅。",
    });
    const lateFinish = journeyReducer(replacement, {
      type: "stream.finished",
      requestId: "request-1",
      result: completeResult,
    });

    expect(lateFinish).toBe(replacement);
    expect(lateFinish.state).toBe("receiving");
    expect(lateFinish.result).toBeNull();
  });

  it("stores live presentations in the snapshot and preserves them at ready", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: requestText,
    });
    const reasoning = journeyReducer(receiving, {
      type: "stream.started",
      requestId: "request-1",
      runId: "run-1",
    });
    const assembling = journeyReducer(reasoning, {
      type: "presentation.updated",
      requestId: "request-1",
      presentation: livePupuPresentation,
    });

    expect(assembling.state).toBe("assembling");
    expect(assembling.runId).toBe("run-1");
    expect(assembling.presentation).toEqual(livePupuPresentation);

    const ready = journeyReducer(assembling, {
      type: "stream.finished",
      requestId: "request-1",
      result: completeResult,
    });

    expect(ready.state).toBe("ready");
    expect(ready.presentation).toEqual(livePupuPresentation);
  });

  it("clears stale presentations for a new request, error, and interruption", () => {
    const active = {
      ...initialJourneySnapshot,
      state: "assembling" as const,
      activeRequestId: "request-1",
      requestText,
      runId: "run-1",
      presentation: livePupuPresentation,
    };

    const failed = journeyReducer(active, {
      type: "stream.failed",
      requestId: "request-1",
      error: { kind: "provider", message: "provider failed" },
    });
    expect(failed.presentation).toBeNull();

    const interrupted = journeyReducer(active, {
      type: "stream.interrupted",
      requestId: "request-1",
    });
    expect(interrupted.presentation).toBeNull();

    const replacement = journeyReducer(active, {
      type: "request.sent",
      requestId: "request-2",
      text: "改成买鸡蛋",
    });
    expect(replacement.presentation).toBeNull();
    expect(replacement.runId).toBeNull();
  });

  it("ignores a late presentation from a previous request", () => {
    const current = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-2",
      text: "买鸡蛋",
    });
    const unchanged = journeyReducer(current, {
      type: "presentation.updated",
      requestId: "request-1",
      presentation: livePupuPresentation,
    });

    expect(unchanged).toBe(current);
  });
});
