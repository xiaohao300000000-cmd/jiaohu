import type { TaskApplicationService } from "../tasks/task-application-service";
import type { PupuLoginConfig } from "../config";
import { readPupuSessionCookie } from "./http-security";
import type { PupuAddressController } from "./address-controller";
import type { PupuSessionStore } from "./session-store";

interface Dependencies {
  sessionStore: PupuSessionStore;
  controller: PupuAddressController;
  taskService: Pick<TaskApplicationService, "bindAddress">;
  ownerId: string;
  config: Pick<PupuLoginConfig, "cliPath" | "accountsRoot" | "dataRoot">;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function handlePupuAddressRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const token = readPupuSessionCookie(request.headers.get("cookie"));
  if (!token) return json({ error: { code: "session_required" } }, 401);
  const session = await dependencies.sessionStore.resolve(token);
  if (session.created) return json({ error: { code: "session_invalid" } }, 401);
  const scope = {
    cliPath: dependencies.config.cliPath,
    accountId: session.accountId,
    accountsRoot: dependencies.config.accountsRoot,
    dataRoot: dependencies.config.dataRoot,
  };
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/addresses")) {
    return json(await dependencies.controller.list(scope));
  }
  if (request.method === "POST" && url.pathname.endsWith("/addresses/select")) {
    const body = await request.json().catch(() => null) as {
      taskId?: unknown;
      taskVersion?: unknown;
      receiverId?: unknown;
    } | null;
    if (
      !body ||
      typeof body.taskId !== "string" ||
      !body.taskId ||
      !Number.isInteger(body.taskVersion) ||
      Number(body.taskVersion) < 1 ||
      typeof body.receiverId !== "string" ||
      !body.receiverId
    ) {
      return json({ error: { code: "invalid_address" } }, 400);
    }
    const binding = await dependencies.controller.resolveSelection(
      scope,
      body.receiverId,
    );
    const task = await dependencies.taskService.bindAddress({
      ownerId: dependencies.ownerId,
      taskId: body.taskId,
      expectedVersion: Number(body.taskVersion),
      providerAccountId: session.accountId,
      binding,
    });
    return json({ task });
  }
  return json({ error: { code: "not_found" } }, 404);
}
