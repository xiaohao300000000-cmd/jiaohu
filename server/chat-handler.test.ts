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


async function* authRequiredEvents(): AsyncGenerator<HermesRunEvent> {
  yield {
    type: "tool.started",
    run_id: "run-auth",
    tool_name: "pupu_cli",
    tool_call_id: "login-status",
  };
  yield {
    type: "tool.completed",
    run_id: "run-auth",
    tool_name: "pupu_cli",
    tool_call_id: "login-status",
    output: {
      schema_version: "1",
      ok: true,
      operation: "pupu.login.status",
      request_id: "auth-status-1",
      household_id: "household-1",
      status: "auth_required",
      data: { auth_present: false },
      error: null,
      evidence_ref: null,
    },
  };
  yield {
    type: "tool.started",
    run_id: "run-auth",
    tool_name: "pupu_cli",
    tool_call_id: "must-not-reach-frontend",
  };
}

function chatRequest(text = "把牛奶加入购物车") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: "journey-1",
      sessionId: "session-1",
      messages: [{
        role: "user",
        parts: [{ type: "text", text }],
      }],
    }),
  });
}

describe("Hermes chat handler", () => {
  it("sends the user request directly to Hermes without a task contract", async () => {
    const createRun = vi.fn(async () => ({ runId: "run-1", toolMessageCursor: 12 }));

    const response = await handleChatRequest(chatRequest(), {
      createRun,
      streamRun: () => hermesEvents(),
    });
    await response.text();

    expect(createRun).toHaveBeenCalledWith(
      "把牛奶加入购物车",
      "session-1",
      "owner-household-f3f3b74a55ae8bf60b6c1172",
      expect.any(AbortSignal),
    );
  });

  it("streams only Hermes events and the Hermes result to the frontend", async () => {
    const response = await handleChatRequest(chatRequest(), {
      createRun: async () => ({ runId: "run-1", toolMessageCursor: 12 }),
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

  it("stops the Hermes run and presents login as soon as Pupu auth expires", async () => {
    const stopRun = vi.fn(async () => undefined);
    const response = await handleChatRequest(chatRequest("看看牛肉"), {
      createRun: async () => ({ runId: "run-auth", toolMessageCursor: 12 }),
      streamRun: () => authRequiredEvents(),
      stopRun,
    });
    const body = await response.text();

    expect(stopRun).toHaveBeenCalledWith("run-auth");
    expect(body).toContain('"component":"pupu.login"');
    expect(body).toContain('"phase":"phone"');
    expect(body).not.toContain("must-not-reach-frontend");
    expect(body).not.toContain("服务暂时没有回应");
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
