import { describe, expect, it, vi } from "vitest";
import { createTaskClient } from "./task-client";

describe("createTaskClient", () => {
  it("restores only the authoritative server TaskSnapshot", async () => {
    const task = { taskId: "task-a", version: 4 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ task }),
    );

    await expect(createTaskClient(fetcher).get("task-a")).resolves.toEqual(task);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/tasks/task-a",
      { credentials: "same-origin" },
    );
  });

  it("fails closed on 404 or a mismatched task identity", async () => {
    await expect(createTaskClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
    ).get("missing")).rejects.toThrow("restored");
    await expect(createTaskClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ task: { taskId: "other", version: 1 } }),
      ),
    ).get("expected")).rejects.toThrow("restored");
  });
});
