import type { ProductSummary } from "../components/agent/agent-ui-event";
interface Preview { previewId: string; version: number; totalCents: number }
export function createPupuCommerceClient(fetchImpl: typeof fetch = fetch) {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(path, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(value.error?.message || "Pupu commerce request failed");
    return value;
  }
  return {
    previewCart: (planId: string, products: ProductSummary[]) => post<Preview>("/api/pupu/cart/preview", {
      planId, items: products.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    }),
    commitCart: (preview: Pick<Preview, "previewId" | "version">) => post<{ status: string }>("/api/pupu/cart/commit", {
      ...preview, idempotencyKey: `cart-${crypto.randomUUID()}`,
    }),
    previewCheckout: () => post<import("../components/pupu/PupuCheckoutJourney").CheckoutPreview>("/api/pupu/checkout/preview", {}),
    createInvitePay: (preview: { previewId: string; version: number }) =>
      post<import("../components/pupu/PupuCheckoutJourney").PaymentPresentation>("/api/pupu/checkout/create-invite-pay", {
        ...preview, idempotencyKey: `order-${crypto.randomUUID()}`,
      }),
  };
}
