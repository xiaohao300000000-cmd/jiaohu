import { describe, expect, it } from "vitest";
import {
  createHermesEventContext,
  mapHermesEvent,
  selectMealProducts,
} from "./hermes-event-adapter";

const requestId = "request-1";
const runId = "run-1";

describe("mapHermesEvent", () => {
  it("maps the complete lifecycle into journey events", () => {
    const context = createHermesEventContext(requestId, "晚餐买牛奶", runId);

    expect(
      mapHermesEvent({ type: "run.started", run_id: runId }, context),
    ).toEqual({ type: "stream.started", requestId, runId });

    expect(
      mapHermesEvent(
        {
          type: "tool.started",
          run_id: runId,
          tool_name: "pupu_search_catalog",
          tool_call_id: "call-1",
        },
        context,
      ),
    ).toEqual({
      type: "trace.updated",
      requestId,
      entries: [
        {
          id: "call-1",
          label: "搜索朴朴商品",
          detail: "正在读取实时商品信息",
          status: "active",
        },
      ],
    });

    const pupu = mapHermesEvent(
      {
        type: "tool.completed",
        run_id: runId,
        tool_name: "pupu_search_catalog",
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
                store_product_id: "store-product-1",
                product_id: "product-1",
                name: "鲜牛奶",
                price_cents: 1290,
                origin_price_cents: 1590,
                unit: "950ml",
                in_stock: true,
                tags: ["冷藏"],
                nutrition: null,
              },
            ],
          },
          error: null,
          next_actions: ["pupu.catalog.detail"],
          evidence_ref: null,
        },
      },
      context,
    );

    expect(pupu).toMatchObject({
      type: "presentation.updated",
      requestId,
      presentation: {
        capability: "pupu",
        component: "pupu.purchase-plan",
        dataSource: "live",
        payload: {
          products: [
            {
              productId: "store-product-1",
              name: "鲜牛奶",
              specification: "950ml",
              unitPrice: 12.9,
              stockStatus: "in_stock",
            },
          ],
          estimatedTotal: 12.9,
          constraints: ["仅使用实时数据", "写入购物车或创建订单前必须确认"],
        },
      },
    });
    expect(JSON.stringify(pupu)).not.toMatch(/"budget"|"total":/);

    expect(
      mapHermesEvent(
        {
          type: "run.completed",
          run_id: runId,
          output: { summary: "已找到 1 件实时商品" },
        },
        context,
      ),
    ).toEqual({
      type: "stream.finished",
      requestId,
      result: {
        title: "朴朴实时方案",
        summary: "已找到 1 件实时商品",
        totalAmount: 12.9,
        currency: "CNY",
        items: [
          {
            id: "store-product-1",
            name: "鲜牛奶",
            detail: "950ml",
            price: 12.9,
          },
        ],
      },
    });
  });

  it("maps failed and cancelled runs without leaking raw details", () => {
    const failedContext = createHermesEventContext(requestId, "query", runId);
    const failed = mapHermesEvent(
      {
        type: "run.failed",
        run_id: runId,
        error: {
          message: "provider failed",
          reference: "opaque-1",
          reasoning_content: "private chain",
          authorization: "Bearer secret",
          cookie: "secret",
          token: "secret",
          sign: "secret",
          seal: "secret",
        },
      },
      failedContext,
    );

    expect(failed).toEqual({
      type: "stream.failed",
      requestId,
      error: {
        kind: "provider",
        message: "实时服务暂时不可用，请稍后重试。",
        reference: "opaque-1",
      },
    });
    expect(JSON.stringify(failed)).not.toMatch(
      /reasoning_content|authorization|cookie|token|sign|seal|private chain|Bearer secret/i,
    );

    const cancelledContext = createHermesEventContext(requestId, "query", runId);
    expect(
      mapHermesEvent(
        { type: "run.cancelled", run_id: runId },
        cancelledContext,
      ),
    ).toEqual({ type: "stream.interrupted", requestId });
  });

  it("rejects malformed provider products instead of marking them live", () => {
    const context = createHermesEventContext(requestId, "query", runId);
    const mapped = mapHermesEvent(
      {
        type: "tool.completed",
        run_id: runId,
        tool_name: "pupu_search_catalog",
        tool_call_id: "call-invalid",
        output: {
          schema_version: "1",

          ok: true,
          operation: "pupu.catalog.search",
          request_id: "provider-invalid",
          household_id: "household-1",
          status: "succeeded",
          data: {
            items: [{ name: "missing provider ids", price_cents: -1 }],
          },
          error: null,
          next_actions: [],
          evidence_ref: null,
        },
      },
      context,
    );

    expect(mapped).toEqual({
      type: "stream.failed",
      requestId,
      error: {
        kind: "invalid_result",
        message: "实时商品数据格式不正确。",
      },
    });
    expect(JSON.stringify(mapped)).not.toContain('"dataSource":"live"');
  });
  it("surfaces real auth_required without fabricating live products", () => {
    const context = createHermesEventContext(requestId, "query", runId);
    mapHermesEvent(
      {
        type: "tool.started",
        run_id: runId,
        tool_name: "pupu_auth_status",
        tool_call_id: "auth-call",
      },
      context,
    );

    const mapped = mapHermesEvent(
      {
        type: "tool.completed",
        run_id: runId,
        tool_name: "pupu_auth_status",
        tool_call_id: "auth-call",
        output: {
          schema_version: "1",
          ok: true,
          operation: "pupu.login.status",
          request_id: "auth-status-1",
          household_id: "household-1",
          status: "auth_required",
          data: { auth_present: false, auth_saved: false },
          error: null,
          next_actions: ["pupu.login.request_code"],
          evidence_ref: null,
        },
      },
      context,
    );

    expect(mapped).toEqual({
      type: "stream.failed",
      requestId,
      error: {
        kind: "provider",
        message: "朴朴登录状态已失效，需要先恢复真实登录态。",
        reference: "auth-status-1",
      },
    });
    expect(JSON.stringify(mapped)).not.toContain('"dataSource":"live"');

    expect(
      mapHermesEvent(
        {
          type: "run.completed",
          run_id: runId,
          output: { summary: "provider failure must not become ready" },
        },
        context,
      ),
    ).toBeNull();
  });

  it("fails closed unless a three-dish summary selects exactly three SKUs", () => {
    const products = ["鸡胸肉", "蔬菜沙拉", "紫菜包饭", "备用鸡腿"].map((name, index) => ({
      productId: `sku-${index}`, name, specification: "1份", unitPrice: 10,
      quantity: 1, currency: "CNY" as const, stockStatus: "in_stock" as const,
      collectedAt: "2026-08-13T00:00:00Z",
    }));
    expect(selectMealProducts(products, "第一道鸡胸肉。第二道蔬菜沙拉。第三道紫菜包饭。替换方案：备用鸡腿。")).toHaveLength(3);
    expect(selectMealProducts(products, "第一道鸡胸肉。第二道蔬菜沙拉。第三道未匹配。")).toHaveLength(0);
  });
});
