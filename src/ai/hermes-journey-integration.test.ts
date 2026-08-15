import { describe, expect, it } from "vitest";
import {
  createHermesEventContext,
  mapHermesEvent,
  type HermesRunEvent,
} from "./hermes-event-adapter";
import {
  initialJourneySnapshot,
  journeyReducer,
} from "../components/journey/journey-reducer";

describe("Hermes adapter to Journey reducer", () => {
  it("keeps a live Pupu presentation inside the final Journey snapshot", () => {
    const requestId = "request-integration";
    const runId = "run-integration";
    const context = createHermesEventContext(requestId, "搜索牛奶", runId);
    const sourceEvents: HermesRunEvent[] = [
      { type: "run.started", run_id: runId },
      {
        type: "tool.completed",
        run_id: runId,
        tool_name: "pupu_cli",
        tool_call_id: "call-1",
        output: {
          schema_version: "1",
          ok: true,
          operation: "pupu.catalog.search",
          request_id: "provider-1",
          household_id: "household-1",
          status: "succeeded",
          data: {
            items: [
              {
                store_product_id: "store-1",
                product_id: "product-1",
                name: "鲜牛奶",
                price_cents: 1290,
                origin_price_cents: null,
                unit: "950ml",
                in_stock: true,
                tags: [],
                nutrition: null,
              },
            ],
          },
          error: null,
          next_actions: [],
          evidence_ref: null,
        },
      },
      {
        type: "run.completed",
        run_id: runId,
        output: { summary: "找到实时牛奶" },
      },
    ];

    let snapshot = journeyReducer(initialJourneySnapshot, {
      type: "request.sent",
      requestId,
      text: "搜索牛奶",
    });
    for (const sourceEvent of sourceEvents) {
      const event = mapHermesEvent(sourceEvent, context);
      if (event) snapshot = journeyReducer(snapshot, event);
    }

    expect(snapshot.state).toBe("ready");
    expect(snapshot.runId).toBe(runId);
    expect(snapshot.presentation).toMatchObject({
      capability: "pupu",
      component: "pupu.purchase-plan",
      dataSource: "live",
      payload: {
        estimatedTotal: 12.9,
        products: [{ productId: "store-1", name: "鲜牛奶" }],
      },
    });
  });
});
