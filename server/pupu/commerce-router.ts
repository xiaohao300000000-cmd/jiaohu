import { z } from "zod";
import type { TaskPhase, TaskSnapshot } from "../../src/domain/task-contract";
import type { PupuLoginConfig } from "../config";
import type { TaskApplicationService } from "../tasks/task-application-service";
import type {
  CartConfirmationPayload,
  PupuCartController,
} from "./cart-controller";
import type {
  CheckoutPreviewPresentation,
  PupuCheckoutController,
} from "./checkout-controller";
import {
  assertMutationRequest,
  noStoreHeaders,
  readPupuSessionCookie,
} from "./http-security";
import type { AddressSelection } from "./commerce-types";
import type { PupuSessionStore } from "./session-store";

interface Dependencies {
  sessionStore: PupuSessionStore;
  taskService: Pick<
    TaskApplicationService,
    | "requirePhase"
    | "createConfirmation"
    | "acquireMutation"
    | "completeMutation"
    | "failMutation"
  >;
  ownerId: string;
  cartController: PupuCartController;
  checkoutController: PupuCheckoutController;
  config: Pick<
    PupuLoginConfig,
    "cliPath" | "accountsRoot" | "dataRoot" | "publicOrigin"
  >;
}

const identitySchema = z.object({
  taskId: z.string().min(1),
  taskVersion: z.number().int().positive(),
}).strict();

const commitSchema = identitySchema.extend({
  confirmationId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/),
}).strict();

const bindingSchema = z.object({
  receiverId: z.string().min(1),
  storeId: z.string().min(1),
  placeId: z.string().min(1),
  placeZip: z.number().int().positive(),
}).strict();

const cartPayloadSchema = z.object({
  planId: z.string().uuid(),
  binding: bindingSchema,
  items: z.array(z.object({
    productId: z.string().min(1),
    providerProductId: z.string().min(1).optional(),
    name: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    unitPriceCents: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
  }).strict()).min(1).max(40),
  totalCents: z.number().int().nonnegative(),
}).strict();

const checkoutPayloadSchema = z.object({
  previewId: z.string().min(1),
  version: z.number().int().positive(),
  addressHint: z.string(),
  lines: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    priceCents: z.number(),
  }).strict()).min(1),
  productTotalCents: z.number().int().nonnegative(),
  deliveryFeeCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  payableCents: z.number().int().nonnegative(),
  deliveryHint: z.string().optional(),
  expiresAt: z.string().datetime(),
}).strict();

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: noStoreHeaders() });
}

function bindingFrom(task: TaskSnapshot): AddressSelection {
  const binding = task.context.addressBinding;
  if (!binding || binding.placeZip === undefined) {
    throw new Error("Pupu delivery address is required");
  }
  return { ...binding, placeZip: binding.placeZip };
}

function scopeFor(
  dependencies: Dependencies,
  accountId: string,
) {
  return {
    cliPath: dependencies.config.cliPath,
    accountId,
    accountsRoot: dependencies.config.accountsRoot,
    dataRoot: dependencies.config.dataRoot,
  };
}

function mutationCommand(input: {
  ownerId: string;
  providerAccountId: string;
  operation: string;
  kind: "cart" | "checkout";
  taskId: string;
  taskVersion: number;
  confirmationId: string;
  idempotencyKey: string;
  enterPhase: TaskPhase;
}) {
  return {
    ownerId: input.ownerId,
    providerAccountId: input.providerAccountId,
    operation: input.operation,
    kind: input.kind,
    taskId: input.taskId,
    expectedVersion: input.taskVersion,
    confirmationId: input.confirmationId,
    idempotencyKey: input.idempotencyKey,
    enterPhase: input.enterPhase,
  };
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
  if (session.created) {
    return json({ error: { code: "session_invalid" } }, 401);
  }

  const body = await request.json().catch(() => null);
  const pathname = new URL(request.url).pathname;
  const scope = scopeFor(dependencies, session.accountId);

  try {
    if (
      pathname.endsWith("/cart/preview") ||
      pathname.endsWith("/checkout/preview")
    ) {
      const parsed = identitySchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: { code: "invalid_request" } }, 400);
      }
      const phase: TaskPhase = pathname.endsWith("/cart/preview")
        ? "awaiting_cart_confirmation"
        : "awaiting_order_confirmation";
      const task = await dependencies.taskService.requirePhase({
        ownerId: dependencies.ownerId,
        providerAccountId: session.accountId,
        taskId: parsed.data.taskId,
        expectedVersion: parsed.data.taskVersion,
        phase,
      });
      const binding = bindingFrom(task);

      if (pathname.endsWith("/cart/preview")) {
        const payload = dependencies.cartController.preview(task, binding);
        const expiresAt = new Date(Date.now() + 2 * 60 * 1_000);
        const prepared = await dependencies.taskService.createConfirmation({
          ownerId: dependencies.ownerId,
          providerAccountId: session.accountId,
          taskId: task.taskId,
          expectedVersion: task.version,
          kind: "cart",
          payload,
          expiresAt,
        });
        return json({
          confirmationId: prepared.confirmationId,
          totalCents: payload.totalCents,
          task: prepared.task,
        });
      }

      const payload = await dependencies.checkoutController.preview(
        scope,
        binding,
      );
      const expiresAt = new Date(payload.expiresAt);
      if (!(expiresAt.getTime() > Date.now())) {
        throw new Error("Pupu checkout preview is already expired");
      }
      const prepared = await dependencies.taskService.createConfirmation({
        ownerId: dependencies.ownerId,
        providerAccountId: session.accountId,
        taskId: task.taskId,
        expectedVersion: task.version,
        kind: "checkout",
        payload,
        expiresAt,
      });
      const {
        previewId: _previewId,
        version: _version,
        ...presentation
      } = payload;
      return json({
        ...presentation,
        confirmationId: prepared.confirmationId,
        task: prepared.task,
      });
    }

    if (
      pathname.endsWith("/cart/commit") ||
      pathname.endsWith("/checkout/create-invite-pay")
    ) {
      const parsed = commitSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: { code: "invalid_request" } }, 400);
      }
      const isCart = pathname.endsWith("/cart/commit");
      const command = mutationCommand({
        ownerId: dependencies.ownerId,
        providerAccountId: session.accountId,
        operation: isCart ? "cart.commit" : "order.create",
        kind: isCart ? "cart" : "checkout",
        taskId: parsed.data.taskId,
        taskVersion: parsed.data.taskVersion,
        confirmationId: parsed.data.confirmationId,
        idempotencyKey: parsed.data.idempotencyKey,
        enterPhase: isCart ? "writing_cart" : "creating_order",
      });
      const acquired = await dependencies.taskService.acquireMutation(command);
      if (acquired.kind === "replay") return json(acquired.result);
      if (acquired.kind === "in_progress") {
        return json({ error: { code: "operation_in_progress" } }, 409);
      }
      const binding = bindingFrom(acquired.task);
      const actorId = `browser-${session.accountId.slice(-12)}`;
      try {
        const providerResult = isCart
          ? await dependencies.cartController.commit(
              scope,
              binding,
              actorId,
              parsed.data.confirmationId,
              cartPayloadSchema.parse(acquired.payload) as CartConfirmationPayload,
            )
          : await dependencies.checkoutController.create(
              scope,
              binding,
              actorId,
              checkoutPayloadSchema.parse(
                acquired.payload,
              ) as CheckoutPreviewPresentation,
            );
        return json(await dependencies.taskService.completeMutation({
          ...command,
          expectedCurrentVersion: acquired.task.version,
          nextPhase: isCart
            ? "awaiting_order_confirmation"
            : "awaiting_payment",
          providerResult,
        }));
      } catch (error) {
        await dependencies.taskService.failMutation({
          ...command,
          expectedCurrentVersion: acquired.task.version,
          errorCode: isCart ? "cart_provider_failed" : "order_provider_failed",
        }).catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    return json({
      error: {
        code: "commerce_conflict",
        message:
          error instanceof Error
            ? error.message
            : "Pupu commerce request failed",
      },
    }, 409);
  }

  return json({ error: { code: "not_found" } }, 404);
}
