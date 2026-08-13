import { act, renderHook, waitFor } from "@testing-library/react";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { JourneyUIMessage } from "./journey-ui-message";
import { useLiveJourney } from "./useLiveJourney";

function taskUpdate(requestId: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<JourneyUIMessage>({
      execute({ writer }) {
        writer.write({
          type: "data-journey",
          data: {
            type: "task.updated",
            requestId,
            task: {
              taskId: "task-login-1",
              version: 2,
              requestText: "买牛奶",
              domain: "commerce",
              goal: "find_products",
              phase: "awaiting_login",
              context: {
                dietaryRequirements: [],
                requirements: ["买牛奶"],
                selectedProducts: [],
              },
              requestedCapabilities: ["commerce.catalog.search"],
              allowedCapabilities: [],
              nextActions: ["login_pupu"],
            },
          },
        });
        writer.write({
          type: "data-journey",
          data: {
            type: "presentation.updated",
            requestId,
            presentation: {
              capability: "pupu",
              component: "pupu.login",
              mode: "anchored",
              dataSource: "live",
              payload: { phase: "phone" },
            },
          },
        });
      },
    }),
  });
}

function ready(requestId: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<JourneyUIMessage>({
      execute({ writer }) {
        writer.write({
          type: "data-journey",
          data: {
            type: "task.updated",
            requestId,
            task: {
              taskId: "task-login-1",
              version: 3,
              requestText: "买牛奶",
              domain: "commerce",
              goal: "find_products",
              phase: "searching_catalog",
              context: {
                dietaryRequirements: [],
                requirements: ["买牛奶"],
                selectedProducts: [],
              },
              requestedCapabilities: ["commerce.catalog.search"],
              allowedCapabilities: ["commerce.catalog.search"],
              nextActions: ["search_catalog"],
            },
          },
        });
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

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request) return input.clone().json() as Promise<Record<string, unknown>>;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("Pupu login from server task phase", () => {
  it("starts with chat, completes login and address, then resumes the same task", async () => {
    const calls: string[] = [];
    const chatBodies: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof Request ? new URL(input.url).pathname : String(input);
      calls.push(url);
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
        const body = await requestBody(input, init);
        chatBodies.push(body);
        return chatBodies.length === 1
          ? taskUpdate(String(body.requestId))
          : ready(String(body.requestId));
      }
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useLiveJourney({ fetch: fetcher }));

    await act(async () => result.current.submit("买牛奶"));
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.login", payload: { phase: "phone" },
    });
    expect(calls.filter((url) => url === "/api/chat")).toHaveLength(1);
    expect(chatBodies[0]).not.toHaveProperty("pupuIntent");

    await act(async () => result.current.submitLoginPhone("13000000000"));
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.login", payload: { phase: "sms" },
    });

    await act(async () => result.current.submitLoginCode("123456"));
    expect(result.current.snapshot.presentation).toMatchObject({
      component: "pupu.address", payload: { phase: "choose" },
    });

    await act(async () => result.current.selectAddress("receiver-a"));
    await waitFor(() => expect(result.current.snapshot.state).toBe("ready"));
    expect(calls.filter((url) => url === "/api/chat")).toHaveLength(2);
    expect(chatBodies[1]).toMatchObject({
      taskId: "task-login-1",
      resume: true,
    });
    expect(chatBodies[1]).not.toHaveProperty("pupuIntent");

    await act(async () => result.current.selectAddress("receiver-a"));
    expect(calls.filter((url) => url === "/api/chat")).toHaveLength(2);
  });
});
