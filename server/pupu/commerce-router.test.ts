import { describe, expect, it, vi } from "vitest";
import { handlePupuCommerceRequest } from "./commerce-router";

const session = { token: "x".repeat(43), accountId: "acct_0123456789abcdef0123456789abcdef", created: false };
const binding = { receiverId: "receiver-a", storeId: "store-a", placeId: "place-a", placeZip: 350100 };
const deps = {
  sessionStore: { resolve: vi.fn().mockResolvedValue(session) },
  addressController: { getSelection: vi.fn().mockReturnValue(binding) },
  cartController: {
    preview: vi.fn().mockReturnValue({ previewId: "cart-a", version: 1, items: [], totalCents: 0 }),
    commit: vi.fn().mockResolvedValue({ status: "verified", previewId: "cart-a", cartItems: [] }),
  },
  checkoutController: {
    preview: vi.fn(), create: vi.fn(),
  },
  config: { cliPath: "/opt/pupu", accountsRoot: "/srv/accounts", dataRoot: "/srv/data", publicOrigin: "http://localhost:4173" },
};

describe("Pupu commerce router", () => {
  it("requires the cookie-bound selected address", async () => {
    const response = await handlePupuCommerceRequest(new Request("http://localhost:4173/api/pupu/cart/preview", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:4173" },
      body: JSON.stringify({ planId: "run-a", items: [] }),
    }), deps as never);
    expect(response.status).toBe(401);
  });

  it("creates a plan-bound preview and idempotent commit", async () => {
    const headers = { "content-type": "application/json", origin: "http://localhost:4173", cookie: `pupu_session=${session.token}` };
    const preview = await handlePupuCommerceRequest(new Request("http://localhost:4173/api/pupu/cart/preview", {
      method: "POST", headers, body: JSON.stringify({ planId: "run-a", items: [{ productId: "sku-a", quantity: 1 }] }),
    }), deps as never);
    expect(preview.status).toBe(200);
    expect(deps.cartController.preview).toHaveBeenCalledWith(session.accountId, binding, "run-a", [{ productId: "sku-a", quantity: 1 }]);

    const commit = await handlePupuCommerceRequest(new Request("http://localhost:4173/api/pupu/cart/commit", {
      method: "POST", headers, body: JSON.stringify({ previewId: "cart-a", version: 1, idempotencyKey: "idem-12345678" }),
    }), deps as never);
    expect(commit.status).toBe(200);
    expect(deps.cartController.commit).toHaveBeenCalled();
  });

  it("rejects cross-origin mutations", async () => {
    const response = await handlePupuCommerceRequest(new Request("http://localhost:4173/api/pupu/cart/preview", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", cookie: `pupu_session=${session.token}` },
      body: JSON.stringify({ planId: "run-a", items: [] }),
    }), deps as never);
    expect(response.status).toBe(403);
  });
});
