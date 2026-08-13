import { describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "./chat-handler";

async function* completed() {
  yield { type: "run.completed" as const, run_id: "run-1", output: { summary: "done" } };
}

describe("chat Pupu scope lifecycle", () => {
  it("prepares trusted scope before Hermes and cleans it after the stream", async () => {
    const order: string[] = [];
    const preparePupuScope = vi.fn(async (_request: Request, sessionId: string) => {
      order.push(`prepare:${sessionId}`);
    });
    const cleanupPupuScope = vi.fn(async (sessionId: string) => {
      order.push(`cleanup:${sessionId}`);
    });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "pupu_session=opaque" },
      body: JSON.stringify({
        requestId: "journey-scope-1",
        pupuIntent: true,
        messages: [{ role: "user", parts: [{ type: "text", text: "find milk" }] }],
      }),
    });
    const response = await handleChatRequest(request, {
      preparePupuScope,
      cleanupPupuScope,
      createRun: async () => {
        order.push("create");
        return { runId: "run-1" };
      },
      streamRun: () => completed(),
      readToolArtifact: async () => ({ status: "missing" }),
    });
    await response.text();

    expect(order).toEqual(["prepare:journey-scope-1", "create", "cleanup:journey-scope-1"]);
  });

  it("does not prepare Pupu scope for an ordinary chat without an explicit intent", async () => {
    const preparePupuScope = vi.fn(async () => undefined);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "journey-chat-1",
        messages: [{ role: "user", parts: [{ type: "text", text: "写一句问候" }] }],
      }),
    });
    const response = await handleChatRequest(request, {
      preparePupuScope,
      createRun: async () => ({ runId: "run-1" }),
      streamRun: () => completed(),
      readToolArtifact: async () => ({ status: "missing" }),
    });
    await response.text();

    expect(preparePupuScope).not.toHaveBeenCalled();
  });
});

