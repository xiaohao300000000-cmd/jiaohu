import { describe, expect, it, vi } from "vitest";
import { HermesTaskAgent } from "./task-agent";

describe("HermesTaskAgent", () => {
  it("owns intent and capability selection through one structured proposal", async () => {
    const createRun = vi.fn(async (_input: string, _sessionId: string) => ({ runId: "run-route-1" }));
    async function* events() {
      yield {
        type: "tool.completed" as const,
        run_id: "run-route-1",
        tool_name: "submit_task_proposal",
        tool_call_id: "call-route-1",
        output: null,
      };
    }
    const agent = new HermesTaskAgent({
      createRun,
      streamRun: () => events(),
      readToolArtifact: async () => ({
        status: "ok",
        result: {
          data: {
            proposal: {
              operation: "start",
              domain: "commerce",
              goal: "find_products",
              requestedCapabilities: ["commerce.catalog.search"],
              contextPatch: {
                peopleCount: 2,
                requirementsToAdd: ["买牛奶"],
              },
            },
          },
        },
      }),
      createId: () => "route-session-1",
    });

    await expect(agent.propose({ input: "两个人买牛奶" })).resolves.toEqual({
      operation: "start",
      domain: "commerce",
      goal: "find_products",
      requestedCapabilities: ["commerce.catalog.search"],
      contextPatch: {
        peopleCount: 2,
        requirementsToAdd: ["买牛奶"],
      },
    });
    expect(createRun.mock.calls[0]?.[0]).toContain(
      "Call submit_task_proposal exactly once",
    );
  });

  it("rejects any provider tool during task interpretation", async () => {
    async function* events() {
      yield {
        type: "tool.completed" as const,
        run_id: "run-route-2",
        tool_name: "pupu_search_catalog",
        tool_call_id: "bad-call",
        output: null,
      };
    }
    const agent = new HermesTaskAgent({
      createRun: async () => ({ runId: "run-route-2" }),
      streamRun: () => events(),
      readToolArtifact: vi.fn(),
    });

    await expect(agent.propose({ input: "买牛奶" }))
      .rejects.toThrow("unauthorized");
  });
});
