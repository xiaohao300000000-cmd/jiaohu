import { describe, expect, it, vi } from "vitest";
import type { HermesRunEvent } from "../src/ai/hermes-event-adapter";
import { handleChatRequest } from "./chat-handler";

async function* hermesEvents(): AsyncGenerator<HermesRunEvent> {
  yield {
    type: "tool.started",
    run_id: "run-1",
    tool_name: "pupu_cli",
    tool_call_id: "tool-1",
  };
  yield {
    type: "tool.completed",
    run_id: "run-1",
    tool_name: "pupu_cli",
    tool_call_id: "tool-1",
    output: {
      schema_version: "1",
      ok: true,
      operation: "pupu.cart.add",
      request_id: "provider-1",
      household_id: null,
      status: "succeeded",
      data: { status: "verified" },
      error: null,
      evidence_ref: null,
    },
  };
  yield {
    type: "run.completed",
    run_id: "run-1",
    output: { summary: "购物车已更新" },
  };
}

function chatRequest(text = "把牛奶加入购物车") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: "journey-1",
      messages: [{
        role: "user",
        parts: [{ type: "text", text }],
      }],
    }),
  });
}

describe("Hermes chat handler", () => {
  it("sends the user request directly to Hermes without a task contract", async () => {
    const createRun = vi.fn(async () => ({ runId: "run-1" }));

    const response = await handleChatRequest(chatRequest(), {
      createRun,
      streamRun: () => hermesEvents(),
    });
    await response.text();

    expect(createRun).toHaveBeenCalledWith(
      "把牛奶加入购物车",
      "journey-1",
      expect.any(AbortSignal),
    );
  });

  it("streams only Hermes events and the Hermes result to the frontend", async () => {
    const response = await handleChatRequest(chatRequest(), {
      createRun: async () => ({ runId: "run-1" }),
      streamRun: () => hermesEvents(),
    });
    const body = await response.text();

    expect(body).toContain("\"type\":\"stream.started\"");
    expect(body).toContain("\"label\":\"执行 Pupu CLI\"");
    expect(body).toContain("\"type\":\"stream.finished\"");
    expect(body).toContain("\"summary\":\"购物车已更新\"");
    expect(body).not.toContain("task.updated");
    expect(body).not.toContain("nextActions");
  });

  it("rejects a request without user text", async () => {
    const response = await handleChatRequest(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
