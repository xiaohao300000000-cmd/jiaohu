import { describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "./chat-handler";
import type { TaskPhase, TaskSnapshot } from "../src/domain/task-contract";
import { TaskCoordinator } from "./tasks/task-coordinator";
import type { TaskProposal } from "./tasks/task-proposal";

function testTaskDependencies() {
  const rules = new TaskCoordinator();
  let task: TaskSnapshot | undefined;
  const taskAgent = {
    propose: async ({ input }: { input: string }): Promise<TaskProposal> => {
      const commerce = input.includes("牛奶");
      return {
        operation: "start",
        domain: commerce ? "commerce" : "general",
        goal: commerce ? "find_products" : "advice",
        requestedCapabilities: commerce ? ["commerce.catalog.search"] : [],
        contextPatch: { requirementsToAdd: [input] },
      };
    },
  };
  const taskService = {
    resolve: async (command: { input: string; proposal: TaskProposal }) => {
      task = rules.acceptNewTask(
        "task-scope-1",
        command.input,
        command.proposal,
      ).next;
      return task;
    },
    get: async () => {
      if (!task) throw new Error("test task was not found");
      return task;
    },
    transition: async (command: {
      expectedVersion: number;
      phase: TaskPhase;
    }) => {
      if (!task || task.version !== command.expectedVersion) {
        throw new Error("test task version conflict");
      }
      task = {
        ...rules.transition(task, command.phase).next,
        version: task.version + 1,
      };
      return task;
    },
  };
  return { taskAgent, taskService };
}

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
        messages: [{ role: "user", parts: [{ type: "text", text: "帮我找牛奶" }] }],
      }),
    });
    const response = await handleChatRequest(request, {
      ...testTaskDependencies(),
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
      ...testTaskDependencies(),
      preparePupuScope,
      createRun: async () => ({ runId: "run-1" }),
      streamRun: () => completed(),
      readToolArtifact: async () => ({ status: "missing" }),
    });
    await response.text();

    expect(preparePupuScope).not.toHaveBeenCalled();
  });
});

