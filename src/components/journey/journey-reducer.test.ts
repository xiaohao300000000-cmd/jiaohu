import { describe, expect, it } from "vitest";
import {
  initialJourneySnapshot,
  journeyReducer,
} from "./journey-reducer";

describe("journeyReducer", () => {
  it("moves from the user request through Hermes execution to its result", () => {
    const requested = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: "搜索牛奶",
    });
    const started = journeyReducer(requested, {
      type: "stream.started",
      requestId: "request-1",
      runId: "run-1",
    });
    const traced = journeyReducer(started, {
      type: "trace.updated",
      requestId: "request-1",
      entries: [{
        id: "call-1",
        label: "执行 Pupu CLI",
        status: "complete",
      }],
    });
    const finished = journeyReducer(traced, {
      type: "stream.finished",
      requestId: "request-1",
      result: {
        title: "Hermes 执行结果",
        summary: "已找到牛奶",
        totalAmount: 0,
        currency: "CNY",
        items: [],
      },
    });

    expect(finished.state).toBe("ready");
    expect(finished.runId).toBe("run-1");
    expect(finished.trace).toHaveLength(1);
    expect(finished.result?.summary).toBe("已找到牛奶");
  });

  it("ignores events from another Hermes request", () => {
    const requested = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId: "request-1",
      text: "搜索牛奶",
    });

    expect(journeyReducer(requested, {
      type: "stream.started",
      requestId: "request-2",
      runId: "run-2",
    })).toBe(requested);
  });
});
