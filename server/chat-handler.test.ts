import { describe, expect, it, vi } from "vitest";
import type { HermesRunEvent } from "../src/ai/hermes-event-adapter";
import type { ToolArtifactIdentity } from "./tool-artifact";
import { handleChatRequest } from "./chat-handler";
import { InMemoryTaskStore } from "./tasks/in-memory-task-store";

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

async function* consecutiveEvents(): AsyncGenerator<HermesRunEvent> {
  yield {
    type: "tool.completed",
    run_id: "run-1",
    tool_name: "pupu_search_catalog",
    tool_call_id: "run-1:pupu_search_catalog:1",
    output: null,
  };
  yield {
    type: "tool.completed",
    run_id: "run-1",
    tool_name: "pupu_read_cart",
    tool_call_id: "run-1:pupu_read_cart:2",
    output: null,
  };
  yield {
    type: "run.completed",
    run_id: "run-1",
    output: { summary: "完成两次实时读取" },
  };
}

function testTaskService(
  store = new InMemoryTaskStore(),
) {
  return {
    resolve: async (command: { input: string; taskId?: string }) =>
      store.resolve(command),
    get: async (_ownerId: string, taskId: string) =>
      store.resume(taskId),
    transition: async (command: {
      taskId: string;
      expectedVersion: number;
      phase: Parameters<InMemoryTaskStore["transition"]>[2];
    }) => store.transition(
      command.taskId,
      command.expectedVersion,
      command.phase,
    ),
    attachProducts: async (
      taskId: string,
      expectedVersion: number,
      products: Parameters<InMemoryTaskStore["attachProducts"]>[2],
    ) => store.attachProducts(taskId, expectedVersion, products),
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
    const readToolArtifact = vi.fn(async (_identity: ToolArtifactIdentity) => ({
      status: "ok" as const,
      result: liveEnvelope,
    }));
    const response = await handleChatRequest(request, {
      taskService: testTaskService(),
      createRun,
      streamRun: () => events(),
      readToolArtifact,
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
      expect.stringContaining("Call pupu_search_catalog exactly once"),
      "journey-client-1",
      expect.any(AbortSignal),
    );
    expect(readToolArtifact).toHaveBeenCalledWith({
      sessionId: "journey-client-1",
      runId: "run-1",
      toolCallId: "run-1:pupu_search_catalog:1",
      toolName: "pupu_search_catalog",
      sequence: 1,
    });
  });

  it("correlates two consecutive Pupu completions with distinct sequences", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-sequence-1",
        messages: [
          {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "搜索牛奶并读取购物车" }],
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    const readToolArtifact = vi.fn(async (_identity: ToolArtifactIdentity) => ({
      status: "ok" as const,
      result: liveEnvelope,
    }));

    const response = await handleChatRequest(request, {
      taskService: testTaskService(),
      createRun: async () => ({ runId: "run-1" }),
      streamRun: () => consecutiveEvents(),
      readToolArtifact,
    });
    await response.text();

    expect(readToolArtifact).toHaveBeenCalledTimes(2);
    expect(readToolArtifact.mock.calls.map(([identity]) => identity)).toEqual([
      expect.objectContaining({
        toolCallId: "run-1:pupu_search_catalog:1",
        toolName: "pupu_search_catalog",
        sequence: 1,
      }),
      expect.objectContaining({
        toolCallId: "run-1:pupu_read_cart:2",
        toolName: "pupu_read_cart",
        sequence: 2,
      }),
    ]);
  });

  it("gives an explicit Pupu search intent a single-tool execution contract", async () => {
    const createRun = vi.fn(async (_input: string) => ({ runId: "run-1" }));
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-search-1",
        pupuIntent: true,
        messages: [{
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "帮我看看大瓶的牛奶" }],
        }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await handleChatRequest(request, {
      taskService: testTaskService(),
      preparePupuScope: async () => undefined,
      createRun,
      streamRun: () => events(),
      readToolArtifact: async () => ({
        status: "ok" as const,
        result: liveEnvelope,
      }),
    });
    await response.text();

    const prompt = createRun.mock.calls[0]?.[0] || "";
    expect(prompt).toContain("Call pupu_search_catalog exactly once");
    expect(prompt).toContain("Do not call pupu_auth_status or pupu_capabilities");
  });

  it("routes commerce from server task state without accepting pupuIntent", async () => {
    const coordinator = new InMemoryTaskStore({ createId: () => "task-route-1" });
    const createRun = vi.fn(async (_input: string) => ({ runId: "run-1" }));
    const preparePupuScope = vi.fn(async () => undefined);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-route-1",
        pupuIntent: false,
        messages: [{ role: "user", parts: [{ type: "text", text: "帮我找牛奶" }] }],
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleChatRequest(request, {
      taskService: testTaskService(coordinator),
      getPupuReadiness: async () => "ready",
      preparePupuScope,
      createRun,
      streamRun: () => events(),
      readToolArtifact: async () => ({ status: "ok" as const, result: liveEnvelope }),
    });
    const body = await response.text();

    expect(body).toContain('"type":"task.updated"');
    expect(body).toContain('"taskId":"task-route-1"');
    expect(preparePupuScope).toHaveBeenCalledWith(
      request,
      "journey-route-1",
      expect.objectContaining({ taskId: "task-route-1", phase: "searching_catalog" }),
    );
    expect(createRun.mock.calls[0]?.[0]).toContain("Call pupu_search_catalog exactly once");
  });

  it("ignores a client pupuIntent flag for ordinary advice", async () => {
    const createRun = vi.fn(async () => ({ runId: "run-1" }));
    const preparePupuScope = vi.fn(async () => undefined);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-advice-1",
        pupuIntent: true,
        messages: [{ role: "user", parts: [{ type: "text", text: "写一句问候" }] }],
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleChatRequest(request, {
      taskService: testTaskService(new InMemoryTaskStore({ createId: () => "task-advice-1" })),
      getPupuReadiness: async () => "ready",
      preparePupuScope,
      createRun,
      streamRun: () => events(),
      readToolArtifact: async () => ({ status: "missing" }),
    });
    await response.text();

    expect(preparePupuScope).not.toHaveBeenCalled();
    expect(createRun).toHaveBeenCalledWith(
      "写一句问候",
      "journey-advice-1",
      expect.any(AbortSignal),
    );
  });

  it.each([
    ["awaiting_login", "pupu.login"],
    ["awaiting_address", "pupu.address"],
  ] as const)("stops before Hermes when readiness is %s", async (readiness, component) => {
    const createRun = vi.fn(async () => ({ runId: "never" }));
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: `journey-${readiness}`,
        messages: [{ role: "user", parts: [{ type: "text", text: "帮我找牛奶" }] }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await handleChatRequest(request, {
      taskService: testTaskService(new InMemoryTaskStore({ createId: () => `task-${readiness}` })),
      getPupuReadiness: async () => readiness,
      createRun,
      streamRun: () => events(),
    });
    const body = await response.text();

    expect(createRun).not.toHaveBeenCalled();
    expect(body).toContain(`"component":"${component}"`);
    expect(body).toContain(`"phase":"${readiness}"`);
  });

  it("resumes the same task after readiness changes without reclassification", async () => {
    const coordinator = new InMemoryTaskStore({ createId: () => "task-resume-1" });
    const firstRequest = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-resume-1",
        messages: [{ role: "user", parts: [{ type: "text", text: "帮我找牛奶" }] }],
      }),
      headers: { "content-type": "application/json" },
    });
    const first = await handleChatRequest(firstRequest, {
      taskService: testTaskService(coordinator),
      getPupuReadiness: async () => "awaiting_login",
      createRun: async () => ({ runId: "never" }),
      streamRun: () => events(),
    });
    expect(await first.text()).toContain('"taskId":"task-resume-1"');

    const createRun = vi.fn(async (_input: string) => ({ runId: "run-1" }));
    const secondRequest = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: "journey-resume-2",
        taskId: "task-resume-1",
        resume: true,
        messages: [{ role: "user", parts: [{ type: "text", text: "这条文本不应重新分类" }] }],
      }),
      headers: { "content-type": "application/json" },
    });
    const second = await handleChatRequest(secondRequest, {
      taskService: testTaskService(coordinator),
      getPupuReadiness: async () => "ready",
      preparePupuScope: async () => undefined,
      createRun,
      streamRun: () => events(),
      readToolArtifact: async () => ({ status: "ok" as const, result: liveEnvelope }),
    });
    const body = await second.text();

    expect(body).toContain('"taskId":"task-resume-1"');
    expect(createRun.mock.calls[0]?.[0]).toContain("帮我找牛奶");
  });
  it("returns a safe typed error for an invalid request", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleChatRequest(request, {
      taskService: testTaskService(),
      createRun: async () => ({ runId: "never" }),
      streamRun: () => events(),
      readToolArtifact: async () => ({ status: "missing" }),
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
