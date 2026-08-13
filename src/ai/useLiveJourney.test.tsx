import { act, renderHook, waitFor } from "@testing-library/react";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { JourneyUIMessage } from "./journey-ui-message";
import { useLiveJourney } from "./useLiveJourney";

function streamResponse(
  requestId: string,
  options: { includePupu?: boolean } = {},
): Response {
  const stream = createUIMessageStream<JourneyUIMessage>({
    execute({ writer }) {
      writer.write({
        type: "data-journey",
        data: { type: "stream.started", requestId, runId: "run-1" },
      });
      if (options.includePupu) {
        writer.write({
          type: "data-journey",
          data: {
            type: "presentation.updated",
            requestId,
            presentation: {
              capability: "pupu",
              component: "pupu.purchase-plan",
              mode: "canvas",
              dataSource: "live",
              payload: {
                stage: "cart_ready",
                title: "实时方案",
                summary: "实时数据",
                meal: "按需采购",
                people: 1,
                constraints: ["只读"],
                decisionSummary: "来自朴朴实时读取",
                products: [
                  {
                    productId: "store-1",
                    name: "鲜牛奶",
                    specification: "950ml",
                    unitPrice: 12.9,
                    quantity: 1,
                    currency: "CNY",
                    stockStatus: "in_stock",
                    collectedAt: "2026-08-10T00:00:00.000Z",
                  },
                ],
                estimatedTotal: 12.9,
                currency: "CNY",
                cartVersion: 0,
                estimatedDelivery: "以实时页面为准",
              },
            },
          },
        });
      }
      writer.write({
        type: "data-journey",
        data: {
          type: "stream.finished",
          requestId,
          result: {
            title: "朴朴实时方案",
            summary: "查询完成",
            totalAmount: options.includePupu ? 12.9 : 0,
            currency: "CNY",
            items: options.includePupu
              ? [
                  {
                    id: "store-1",
                    name: "鲜牛奶",
                    detail: "950ml",
                    price: 12.9,
                  },
                ]
              : [],
          },
        },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

describe("useLiveJourney", () => {
  it("dispatches request.sent immediately and consumes journey data parts", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { result } = renderHook(() => useLiveJourney({ fetch: fetchMock }));

    let submission: Promise<void>;
    act(() => {
      submission = result.current.submit("帮我整理今天的待办");
    });

    expect(result.current.snapshot.state).toBe("receiving");
    expect(result.current.snapshot.requestText).toBe("帮我整理今天的待办");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [fetchInput, fetchInit] = fetchMock.mock.calls[0];
    const body = fetchInput instanceof Request
      ? await fetchInput.clone().json() as { requestId: string }
      : JSON.parse(String(fetchInit?.body)) as { requestId: string };
    const requestId = body.requestId;
    expect(body).not.toHaveProperty("pupuIntent");
    resolveFetch?.(streamResponse(requestId));
    await act(async () => submission);

    await waitFor(() => expect(result.current.snapshot.state).toBe("ready"));
  });

  it("stores streamed live Pupu presentations only in the Journey snapshot", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/pupu/login/status") {
        return Response.json({ phase: "connected" });
      }
      if (url === "/api/pupu/addresses") {
        return Response.json({ addresses: [{
          id: "receiver-a", label: "地址 1", region: "已保存区域",
          detailHint: "3 栋 1201", phoneSuffix: "",
        }] });
      }
      if (url === "/api/pupu/addresses/select") {
        return Response.json({ selected: true, addressId: "receiver-a" });
      }
      const body = JSON.parse(String(init?.body));
      return streamResponse(body.requestId, { includePupu: true });
    });
    const { result } = renderHook(() => useLiveJourney({ fetch: fetchMock }));

    await act(async () => {
      await result.current.submit("买牛奶");
    });
    await act(async () => {
      await result.current.selectAddress("receiver-a");
    });

    await waitFor(() =>
      expect(result.current.snapshot.presentation?.dataSource).toBe("live"),
    );
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.purchase-plan",
      payload: { products: [{ name: "鲜牛奶" }] },
    });
    expect("pupuEvent" in result.current).toBe(false);

    act(() => result.current.reset());

    expect(result.current.snapshot.state).toBe("idle");
    expect(result.current.snapshot.presentation).toBeNull();
  });

  it("turns transport failures into a typed journey error", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("authorization secret");
    });
    const { result } = renderHook(() => useLiveJourney({ fetch: fetchMock }));

    await act(async () => {
      await result.current.submit("查一下我的快递");
    });

    await waitFor(() => expect(result.current.snapshot.state).toBe("error"));
    expect(result.current.snapshot.error).toMatchObject({
      kind: "provider",
      message: "实时服务暂时不可用，请稍后重试。",
    });
    expect(JSON.stringify(result.current.snapshot.error)).not.toContain(
      "authorization secret",
    );
  });
});
