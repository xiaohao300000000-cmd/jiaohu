import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../domain/task-contract";
import { initialJourneySnapshot, journeyReducer } from "./journey-reducer";
import type {
  JourneyPresentation,
  JourneyResult,
  TraceEntry,
} from "./types";

const requestText = "今晚三个人吃火锅，微辣，200元以内。";

const searchingTask: TaskSnapshot = {
  taskId: "task-1",
  version: 1,
  requestText,
  domain: "commerce",
  goal: "find_products",
  phase: "searching_catalog",
  context: {
    peopleCount: 3,
    budgetCents: 20000,
    dietaryRequirements: ["微辣"],
    requirements: ["微辣"],
    selectedProducts: [],
  },
  requestedCapabilities: ["commerce.catalog.search"],
  allowedCapabilities: ["commerce.catalog.search"],
  nextActions: [],
};
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
  it("stores task updates only for the active request", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent", requestId: "request-1", text: requestText,
    });
    const ignored = journeyReducer(receiving, {
      type: "task.updated", requestId: "request-old", task: searchingTask,
    });
    expect(ignored.task).toBeNull();

    const updated = journeyReducer(receiving, {
      type: "task.updated", requestId: "request-1", task: searchingTask,
    });
    expect(updated.task).toEqual(searchingTask);
    expect(updated.state).toBe("reasoning");
  });

  it("keeps a gated task phase while later presentation and trace events arrive", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent", requestId: "request-1", text: requestText,
    });
    const awaitingLoginTask: TaskSnapshot = {
      ...searchingTask,
      phase: "awaiting_login",
      allowedCapabilities: [],
    };
    const withTask = journeyReducer(receiving, {
      type: "task.updated", requestId: "request-1", task: awaitingLoginTask,
    });
    const withPresentation = journeyReducer(withTask, {
      type: "presentation.updated",
      requestId: "request-1",
      presentation: {
        capability: "pupu",
        component: "pupu.login",
        mode: "anchored",
        dataSource: "live",
        payload: { phase: "phone" },
      },
    });
    const withTrace = journeyReducer(withPresentation, {
      type: "trace.updated", requestId: "request-1", entries: trace,
    });

    expect(withTrace.task).toEqual(awaitingLoginTask);
    expect(withTrace.state).toBe("awaiting_input");
  });

  it("retains the previous task while a continuation request starts", () => {
    const active = {
      ...initialJourneySnapshot,
      task: searchingTask,
    };
    const receiving = journeyReducer(active, {
      type: "request.sent", requestId: "request-2", text: "牛奶改成两盒",
    });

    expect(receiving.task).toEqual(searchingTask);
  });
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

  it("merges the final Hermes meal summary into a live Pupu plan", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent", requestId: "request-1", text: requestText,
    });
    const assembling = journeyReducer(receiving, {
      type: "presentation.updated", requestId: "request-1",
      presentation: livePupuPresentation,
    });
    const summary = "三道菜：清蒸鱼、蒜蓉青菜、香煎豆腐。步骤简单，覆盖蛋白质、蔬菜和豆制品。";
    const ready = journeyReducer(assembling, {
      type: "stream.finished", requestId: "request-1",
      result: { ...completeResult, summary },
    });

    expect(ready.presentation).toMatchObject({
      component: "pupu.purchase-plan",
      payload: { summary, decisionSummary: summary },
    });
  });

  it("recalculates the displayed total from the final selected products", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent", requestId: "request-1", text: requestText,
    });
    const assembling = journeyReducer(receiving, {
      type: "presentation.updated", requestId: "request-1",
      presentation: {
        ...livePupuPresentation,
        payload: { ...livePupuPresentation.payload, estimatedTotal: 142.52 },
      },
    });
    const ready = journeyReducer(assembling, {
      type: "stream.finished", requestId: "request-1",
      result: {
        title: "三道菜", summary: "只保留鲜牛奶", totalAmount: 12.9, currency: "CNY",
        items: [{ id: "store-1", name: "鲜牛奶", detail: "950ml", price: 12.9 }],
      },
    });
    expect(ready.presentation?.component).toBe("pupu.purchase-plan");
    if (ready.presentation?.component === "pupu.purchase-plan") {
      expect(ready.presentation.payload.estimatedTotal).toBe(12.9);
    }
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
    expect(ready.presentation).toEqual({
      ...livePupuPresentation,
      payload: {
        ...livePupuPresentation.payload,
        summary: completeResult.summary,
        decisionSummary: completeResult.summary,
        products: [],
        estimatedTotal: completeResult.totalAmount,
      },
    });
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
