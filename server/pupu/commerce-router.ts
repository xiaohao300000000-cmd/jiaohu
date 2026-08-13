import type { TaskSnapshot } from "../../src/domain/task-contract";
import type { PupuLoginConfig } from "../config";
import type { TaskCoordinator } from "../tasks/task-coordinator";
import type { PupuAddressController } from "./address-controller";
import type { PupuCartController } from "./cart-controller";
import type { PupuCheckoutController } from "./checkout-controller";
import { assertMutationRequest, noStoreHeaders, readPupuSessionCookie } from "./http-security";
import type { PupuSessionStore } from "./session-store";

interface Dependencies {
  taskCoordinator: TaskCoordinator;
  sessionStore: PupuSessionStore;
  addressController: Pick<PupuAddressController, "getSelection">;
  cartController: PupuCartController;
  checkoutController: PupuCheckoutController;
  config: Pick<PupuLoginConfig, "cliPath" | "accountsRoot" | "dataRoot" | "publicOrigin">;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: noStoreHeaders() });
}

function confirmation(previewId: string, version: number, expiresAt?: string) {
  return {
    id: previewId,
    version,
    expiresAt: expiresAt || new Date(Date.now() + 120_000).toISOString(),
  };
}

function bodyTask(body: Record<string, unknown>): {
  taskId: string;
  taskVersion: number;
} {
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const taskVersion = Number(body.taskVersion);
  if (!taskId || !Number.isSafeInteger(taskVersion)) {
    throw new Error("task identity is required");
  }
  return { taskId, taskVersion };
}

function responseWithTask(result: object, task: TaskSnapshot) {
  return { ...result, task };
}

export async function handlePupuCommerceRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: { code: "not_found" } }, 404);
  }
  try {
    assertMutationRequest(request, dependencies.config.publicOrigin);
  } catch {
    return json({ error: { code: "origin_not_allowed" } }, 403);
  }
  const token = readPupuSessionCookie(request.headers.get("cookie"));
  if (!token) return json({ error: { code: "session_required" } }, 401);
  const session = await dependencies.sessionStore.resolve(token);
  if (session.created) return json({ error: { code: "session_invalid" } }, 401);
  const binding = dependencies.addressController.getSelection(session.accountId);
  if (!binding) return json({ error: { code: "address_required" } }, 409);
  const scope = {
    cliPath: dependencies.config.cliPath,
    accountId: session.accountId,
    accountsRoot: dependencies.config.accountsRoot,
    dataRoot: dependencies.config.dataRoot,
  };
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: { code: "invalid_request" } }, 400);
  const pathname = new URL(request.url).pathname;

  try {
    const { taskId, taskVersion } = bodyTask(body);
    if (pathname.endsWith("/cart/preview")) {
      dependencies.taskCoordinator.assertPhase(
        taskId,
        taskVersion,
        "awaiting_cart_confirmation",
      );
      const planId = typeof body.planId === "string" ? body.planId : "";
      const items = Array.isArray(body.items)
        ? body.items.map((item) => ({
            productId:
              typeof item === "object" && item && "productId" in item
                ? String(item.productId)
                : "",
            quantity:
              typeof item === "object" && item && "quantity" in item
                ? Number(item.quantity)
                : 0,
          }))
        : [];
      const preview = dependencies.cartController.preview(
        session.accountId,
        binding,
        planId,
        items,
      );
      const task = dependencies.taskCoordinator.bindConfirmation(
        taskId,
        taskVersion,
        "cart",
        confirmation(preview.previewId, preview.version),
      );
      return json(responseWithTask(preview, task));
    }

    if (pathname.endsWith("/cart/commit")) {
      const confirmedTask = dependencies.taskCoordinator.assertPhase(
        taskId,
        taskVersion,
        "awaiting_cart_confirmation",
      );
      const previewId = typeof body.previewId === "string" ? body.previewId : "";
      const previewVersion = Number(body.version);
      if (
        confirmedTask.context.cartPreview?.id !== previewId ||
        confirmedTask.context.cartPreview.version !== previewVersion
      ) {
        throw new Error("cart confirmation does not match task preview");
      }
      const task = dependencies.taskCoordinator.transition(
        taskId, taskVersion, "writing_cart",
      );
      const actorId = `browser-${session.accountId.slice(-12)}`;
      const result = await dependencies.cartController.commit(
        scope,
        binding,
        actorId,
        {
          previewId,
          version: previewVersion,
          idempotencyKey:
            typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
        },
      );
      const nextTask = dependencies.taskCoordinator.transition(
        task.taskId,
        task.version,
        "awaiting_order_confirmation",
      );
      return json(responseWithTask(result, nextTask));
    }

    if (pathname.endsWith("/checkout/preview")) {
      dependencies.taskCoordinator.assertPhase(
        taskId,
        taskVersion,
        "awaiting_order_confirmation",
      );
      const preview = await dependencies.checkoutController.preview(scope, binding);
      const task = dependencies.taskCoordinator.bindConfirmation(
        taskId,
        taskVersion,
        "checkout",
        confirmation(preview.previewId, preview.version, preview.expiresAt),
      );
      return json(responseWithTask(preview, task));
    }

    if (pathname.endsWith("/checkout/create-invite-pay")) {
      const confirmedTask = dependencies.taskCoordinator.assertPhase(
        taskId,
        taskVersion,
        "awaiting_order_confirmation",
      );
      const previewId = typeof body.previewId === "string" ? body.previewId : "";
      const previewVersion = Number(body.version);
      if (
        confirmedTask.context.checkoutPreview?.id !== previewId ||
        confirmedTask.context.checkoutPreview.version !== previewVersion
      ) {
        throw new Error("order confirmation does not match task preview");
      }
      const task = dependencies.taskCoordinator.transition(
        taskId, taskVersion, "creating_order",
      );
      const actorId = `browser-${session.accountId.slice(-12)}`;
      const result = await dependencies.checkoutController.create(
        scope,
        binding,
        actorId,
        {
          previewId,
          version: previewVersion,
          idempotencyKey:
            typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
        },
      );
      const nextTask = dependencies.taskCoordinator.transition(
        task.taskId,
        task.version,
        "awaiting_payment",
      );
      return json(responseWithTask(result, nextTask));
    }
  } catch (error) {
    return json({
      error: {
        code: "commerce_conflict",
        message:
          error instanceof Error ? error.message : "Pupu commerce request failed",
      },
    }, 409);
  }
  return json({ error: { code: "not_found" } }, 404);
}
