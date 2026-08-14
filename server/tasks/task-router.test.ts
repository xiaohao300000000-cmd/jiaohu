import { describe, expect, it, vi } from "vitest";
import { handleTaskRequest } from "./task-router";
import { TaskNotFoundError } from "./task-repository";

describe("handleTaskRequest", () => {
  it("returns the owner's snapshot without caching", async () => {
    const get = vi.fn(async () => ({ taskId: "task-1", version: 2 }));
    const response = await handleTaskRequest(
      new Request("http://localhost/api/tasks/task-1"),
      {
        taskService: { get } as never,
        owner: { ownerId: "owner-a", setCookie: "pupu_task_owner=x" },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBe("pupu_task_owner=x");
    expect(get).toHaveBeenCalledWith("owner-a", "task-1");
    expect(await response.json()).toEqual({
      task: { taskId: "task-1", version: 2 },
    });
  });

  it("returns 404 without revealing another owner", async () => {
    const response = await handleTaskRequest(
      new Request("http://localhost/api/tasks/task-1"),
      {
        taskService: {
          get: async () => {
            throw new TaskNotFoundError();
          },
        } as never,
        owner: { ownerId: "owner-b" },
      },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
