import type { PupuLoginConfig } from "../config";
import type { PupuAddressController } from "./address-controller";
import type { PupuCartController } from "./cart-controller";
import type { PupuCheckoutController } from "./checkout-controller";
import { assertMutationRequest, noStoreHeaders, readPupuSessionCookie } from "./http-security";
import type { PupuSessionStore } from "./session-store";

interface Dependencies {
  sessionStore: PupuSessionStore;
  addressController: Pick<PupuAddressController, "getSelection">;
  cartController: PupuCartController;
  checkoutController: PupuCheckoutController;
  config: Pick<PupuLoginConfig, "cliPath" | "accountsRoot" | "dataRoot" | "publicOrigin">;
}
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: noStoreHeaders() });
}
export async function handlePupuCommerceRequest(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.method !== "POST") return json({ error: { code: "not_found" } }, 404);
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
    cliPath: dependencies.config.cliPath, accountId: session.accountId,
    accountsRoot: dependencies.config.accountsRoot, dataRoot: dependencies.config.dataRoot,
  };
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: { code: "invalid_request" } }, 400);
  const pathname = new URL(request.url).pathname;
  try {
    if (pathname.endsWith("/cart/preview")) {
      const planId = typeof body.planId === "string" ? body.planId : "";
      const items = Array.isArray(body.items) ? body.items.map((item) => ({
        productId: typeof item === "object" && item && "productId" in item ? String(item.productId) : "",
        quantity: typeof item === "object" && item && "quantity" in item ? Number(item.quantity) : 0,
      })) : [];
      return json(dependencies.cartController.preview(session.accountId, binding, planId, items));
    }
    if (pathname.endsWith("/cart/commit")) {
      const actorId = `browser-${session.accountId.slice(-12)}`;
      return json(await dependencies.cartController.commit(scope, binding, actorId, {
        previewId: typeof body.previewId === "string" ? body.previewId : "",
        version: Number(body.version),
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
      }));
    }
    if (pathname.endsWith("/checkout/preview")) {
      return json(await dependencies.checkoutController.preview(scope, binding));
    }
    if (pathname.endsWith("/checkout/create-invite-pay")) {
      const actorId = `browser-${session.accountId.slice(-12)}`;
      return json(await dependencies.checkoutController.create(scope, binding, actorId, {
        previewId: typeof body.previewId === "string" ? body.previewId : "",
        version: Number(body.version),
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
      }));
    }
  } catch (error) {
    return json({
      error: {
        code: "commerce_conflict",
        message: error instanceof Error ? error.message : "Pupu commerce request failed",
      },
    }, 409);
  }
  return json({ error: { code: "not_found" } }, 404);
}
