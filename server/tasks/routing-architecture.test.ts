import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PRODUCTION_ROUTING_FILES = [
  "server/chat-handler.ts",
  "server/pupu/commerce-router.ts",
  "src/ai/useLiveJourney.ts",
  "src/components/home/presentation.ts",
];

describe("central task routing architecture", () => {
  it("keeps removed intent classifiers out of production consumers", async () => {
    const sources = await Promise.all(
      PRODUCTION_ROUTING_FILES.map((path) => readFile(path, "utf8")),
    );
    expect(sources.join("\n")).not.toMatch(
      /pupuIntent|isPupuTask|isComplexMealRequest/,
    );
  });

  it("has no legacy classifier or in-memory Task store", async () => {
    await expect(
      access("server/pupu/request-classifier.ts"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access("server/tasks/in-memory-task-store.ts"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps TaskCoordinator as rules beside the Agent", async () => {
    const coordinator = await readFile(
      "server/tasks/task-coordinator.ts",
      "utf8",
    );
    const agent = await readFile("server/agents/task-agent.ts", "utf8");

    expect(coordinator).not.toMatch(/new Map/);
    expect(coordinator).not.toMatch(
      /classify|contextFrom|COMMERCE_PATTERN|REVISION_PATTERN/,
    );
    expect(coordinator).toContain("TaskProposal");
    expect(coordinator).not.toMatch(
      /from ["'](?:pg|\.\.\/db|\.\/task-repository)/,
    );
    expect(agent).toContain("submit_task_proposal");
  });

  it("keeps business truth out of process maps and natural-language summaries", async () => {
    const [cart, checkout, chat, adapter] = await Promise.all([
      readFile("server/pupu/cart-controller.ts", "utf8"),
      readFile("server/pupu/checkout-controller.ts", "utf8"),
      readFile("server/chat-handler.ts", "utf8"),
      readFile("src/ai/hermes-event-adapter.ts", "utf8"),
    ]);

    expect(cart).not.toMatch(
      /plans\s*=\s*new Map|previews\s*=\s*new Map|commits\s*=\s*new Map/,
    );
    expect(checkout).not.toMatch(
      /previews\s*=\s*new Map|creations\s*=\s*new Map/,
    );
    expect(chat).not.toMatch(/registerPupuPlan|attachProducts/);
    expect(adapter).not.toMatch(
      /selectMealProducts|summary.*includes|includes\(product\.name\)/,
    );
  });

  it("fails startup closed until PostgreSQL migration and health checks pass", async () => {
    const source = await readFile("server/index.ts", "utf8");

    expect(source).toContain("await migrate(databasePool");
    expect(source).toMatch(/await databasePool\.query\(["']SELECT 1["']\)/);
    expect(source).not.toMatch(/InMemoryTaskStore|memory fallback/i);
  });

});
