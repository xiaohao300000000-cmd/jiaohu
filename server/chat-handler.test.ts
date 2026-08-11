import { describe, expect, it, vi } from "vitest";
import type { HermesRunEvent } from "../src/ai/hermes-event-adapter";
import { handleChatRequest } from "./chat-handler";

const liveEnvelope = {
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
};

async function* events(): AsyncGenerator<HermesRunEvent> {
  yield {
    type: "tool.started",
    run_id: "run-1",
    tool_name: "pupu_search_catalog",
    tool_call_id: "run-1:pupu_search_catalog:1",
  };
  yield {
    type: "tool.completed",
    run_id: "run-1",
    tool_name: "pupu_search_catalog",
    tool_call_id: "run-1:pupu_search_catalog:1",
    output: liveEnvelope,
  };
  yield {
    type: "run.completed",
    run_id: "run-1",
    output: { summary: "找到实时牛奶" },
  };
}

describe("handleChatRequest", () => {
  it("streams typed AI SDK data parts without raw secrets", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-client-1",
        messages: [
          {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "帮我找牛奶" }],
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    const createRun = vi.fn(async () => ({ runId: "run-1" }));
    const response = await handleChatRequest(request, {
      createRun,
      streamRun: () => events(),
      readRunArtifact: async () => liveEnvelope,
      createId: () => "session-1",
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"type":"data-journey"');
    expect(body).not.toContain('"type":"data-pupu"');
    expect(body).toContain('"type":"presentation.updated"');
    expect(body).toContain('"dataSource":"live"');
    expect(body).not.toMatch(/authorization|cookie|reasoning_content|secret/i);
    expect(createRun).toHaveBeenCalledWith(
      "帮我找牛奶", "journey-client-1", expect.any(AbortSignal),
    );
  });

  it("returns a safe typed error for an invalid request", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleChatRequest(request, {
      createRun: async () => ({ runId: "never" }),
      streamRun: () => events(),
      readRunArtifact: async () => null,
      createId: () => "session-invalid",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "请输入任务内容。",
      },
    });
  });
});
