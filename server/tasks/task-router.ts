import { TaskConflictError } from "./task-coordinator";
import type { TaskApplicationService } from "./task-application-service";
import type { TaskOwner } from "./task-owner";
import { TaskNotFoundError } from "./task-repository";

interface Dependencies {
  taskService: Pick<TaskApplicationService, "get">;
  owner: TaskOwner;
}

export async function handleTaskRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json(
      { error: { code: "method_not_allowed", message: "Method not allowed" } },
      { status: 405 },
    );
  }
  const match = new URL(request.url).pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (!match) {
    return Response.json(
      { error: { code: "not_found", message: "Task not found" } },
      { status: 404 },
    );
  }

  try {
    const task = await dependencies.taskService.get(
      dependencies.owner.ownerId,
      decodeURIComponent(match[1]),
    );
    const headers = new Headers({ "cache-control": "no-store" });
    if (dependencies.owner.setCookie) {
      headers.set("set-cookie", dependencies.owner.setCookie);
    }
    return Response.json({ task }, { headers });
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      return Response.json(
        { error: { code: "not_found", message: "Task not found" } },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    if (error instanceof TaskConflictError) {
      return Response.json(
        { error: { code: "task_conflict", message: error.message } },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}
