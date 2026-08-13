import { act, renderHook, waitFor } from "@testing-library/react";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { JourneyUIMessage } from "./journey-ui-message";
import { useLiveJourney } from "./useLiveJourney";

function ready(requestId: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<JourneyUIMessage>({
      execute({ writer }) {
        writer.write({
          type: "data-journey",
          data: { type: "stream.started", requestId, runId: "run-1" },
        });
        writer.write({
          type: "data-journey",
          data: {
            type: "stream.finished", requestId,
            result: { title: "live", summary: "done", totalAmount: 0, currency: "CNY", items: [] },
          },
        });
      },
    }),
  });
}

describe("Pupu login preflight", () => {
  it("holds the task, logs in, and resumes Hermes exactly once", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/status")) return Response.json({ phase: "auth_required" });
      if (url.endsWith("/start")) return Response.json({ phase: "sms", attemptId: "attempt-1" });
      if (url.endsWith("/verify")) return Response.json({ phase: "connected" });
      if (url === "/api/pupu/addresses") return Response.json({
        addresses: [{ id: "receiver-a", label: "地址 1", region: "已保存区域",
          detailHint: "3 栋 1201", phoneSuffix: "" }],
      });
      if (url === "/api/pupu/addresses/select") {
        return Response.json({ selected: true, addressId: "receiver-a" });
      }
      if (url === "/api/chat") {
        const body = JSON.parse(String(init?.body));
        return ready(body.requestId);
      }
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useLiveJourney({ fetch: fetcher }));

    await act(async () => result.current.submit("买牛奶"));
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.login", payload: { phase: "phone" },
    });
    expect(calls).not.toContain("/api/chat");

    await act(async () => result.current.submitLoginPhone("13000000000"));
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.login", payload: { phase: "sms" },
    });

    await act(async () => result.current.submitLoginCode("123456"));
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.address", payload: { phase: "choose" },
    });
    expect(calls.filter((url) => url === "/api/chat")).toHaveLength(0);

    await act(async () => result.current.selectAddress("receiver-a"));
    await waitFor(() => expect(result.current.snapshot.state).toBe("ready"));
    expect(calls.filter((url) => url === "/api/chat")).toHaveLength(1);

    await act(async () => result.current.selectAddress("receiver-a"));
    expect(calls.filter((url) => url === "/api/chat")).toHaveLength(1);
  });
});

