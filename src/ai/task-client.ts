import type { TaskSnapshot } from "../domain/task-contract";

export function createTaskClient(fetchImpl: typeof fetch = fetch) {
  return {
    async get(taskId: string): Promise<TaskSnapshot> {
      const response = await fetchImpl(
        `/api/tasks/${encodeURIComponent(taskId)}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error("Task could not be restored");
      const value = await response.json() as { task?: unknown };
      const task = value.task;
      if (
        !task ||
        typeof task !== "object" ||
        (task as { taskId?: unknown }).taskId !== taskId ||
        !Number.isSafeInteger((task as { version?: unknown }).version)
      ) {
        throw new Error("Task could not be restored");
      }
      return task as TaskSnapshot;
    },
  };
}
