import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PRODUCTION_ROUTING_FILES = [
  "server/chat-handler.ts",
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

  it("has no legacy server request classifier module", async () => {
    await expect(
      access("server/pupu/request-classifier.ts"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps TaskCoordinator free of persistence and process state", async () => {
    const source = await readFile(
      "server/tasks/task-coordinator.ts",
      "utf8",
    );
    expect(source).not.toMatch(/new Map/);
    expect(source).not.toMatch(
      /from ["'](?:pg|\.\.\/db|\.\/task-repository)/,
    );
  });
});
