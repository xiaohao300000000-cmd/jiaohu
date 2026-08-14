import { act, renderHook, waitFor } from "@testing-library/react";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "../domain/task-contract";
import type { JourneyUIMessage } from "./journey-ui-message";
import { useLiveJourney } from "./useLiveJourney";

const finalTask: TaskSnapshot = {
  taskId: "task-restorable",
  version: 6,
  requestText: "买两盒牛奶",
  domain: "commerce",
  goal: "prepare_cart",
  phase: "awaiting_cart_confirmation",
  context: {
    dietaryRequirements: [],
    requirements: [],
    selectedProducts: [{
      productId: "milk",
      name: "鲜牛奶",
      quantity: 2,
      unitPriceCents: 1290,
      source: "pupu_live",
    }],
  },
  finalPlan: {
    planId: "plan-postgres",
    version: 2,
    title: "牛奶补货",
    explanation: "结构化最终方案",
    totalCents: 2580,
    currency: "CNY",
  },
  requestedCapabilities: ["commerce.catalog.search"],
  allowedCapabilities: ["commerce.cart.prepare"],
  nextActions: ["confirm_cart"],
};

function streamResponse(requestId: string, task?: TaskSnapshot): Response {
  const stream = createUIMessageStream<JourneyUIMessage>({
    execute({ writer }) {
      writer.write({
        type: "data-journey",
        data: { type: "stream.started", requestId, runId: "run-1" },
      });
      if (task) {
        writer.write({
          type: "data-journey",
          data: { type: "task.updated", requestId, task },
        });
      }
      writer.write({
        type: "data-journey",
        data: {
          type: "stream.finished",
          requestId,
          result: {
            title: "处理完成",
            summary: "文字总结不承载商品事实",
            totalAmount: 0,
            currency: "CNY",
            items: [],
          },
        },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

describe("useLiveJourney", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("dispatches request.sent immediately and consumes journey data parts", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise<Response>((resolve) => {
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
    expect(body).not.toHaveProperty("pupuIntent");
    resolveFetch?.(streamResponse(body.requestId));
    await act(async () => submission);

    await waitFor(() => expect(result.current.snapshot.state).toBe("ready"));
  });

  it("stores only the Task ID and clears it when the user resets", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const body = input instanceof Request
        ? await input.clone().json() as { requestId: string }
        : JSON.parse(String(init?.body)) as { requestId: string };
      return streamResponse(body.requestId, finalTask);
    });
    const { result } = renderHook(() => useLiveJourney({ fetch: fetchMock }));

    await act(async () => {
      await result.current.submit("买两盒牛奶");
    });

    await waitFor(() =>
      expect(result.current.snapshot.task?.finalPlan?.planId).toBe("plan-postgres"),
    );
    expect(window.sessionStorage.getItem("liquidjourney.taskId")).toBe(
      "task-restorable",
    );
    expect(window.sessionStorage).toHaveLength(1);

    act(() => result.current.reset());

    expect(result.current.snapshot.state).toBe("idle");
    expect(result.current.snapshot.task).toBeNull();
    expect(window.sessionStorage.getItem("liquidjourney.taskId")).toBeNull();
  });

  it("restores the authoritative TaskSnapshot after refresh", async () => {
    window.sessionStorage.setItem("liquidjourney.taskId", finalTask.taskId);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ task: finalTask }),
    );

    const { result } = renderHook(() => useLiveJourney({ fetch: fetchMock }));

    await waitFor(() => expect(result.current.snapshot.task).toEqual(finalTask));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-restorable",
      { credentials: "same-origin" },
    );
    expect(result.current.snapshot.task?.context.selectedProducts).toEqual(
      finalTask.context.selectedProducts,
    );
  });

  it("clears a stale Task ID when restore fails", async () => {
    window.sessionStorage.setItem("liquidjourney.taskId", "missing-task");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    renderHook(() => useLiveJourney({ fetch: fetchMock }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem("liquidjourney.taskId")).toBeNull(),
    );
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
