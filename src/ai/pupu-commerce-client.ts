import type { ProductSummary } from "../components/agent/agent-ui-event";
import type { TaskSnapshot } from "../domain/task-contract";

export interface CommerceTaskIdentity {
  taskId: string;
  version: number;
}

interface TaskResult {
  task: TaskSnapshot;
}
export interface CartPreview extends TaskResult {
  previewId: string;
  version: number;
  totalCents: number;
}
export interface CartCommitResult extends TaskResult {
  status: string;
}

export function createPupuCommerceClient(fetchImpl: typeof fetch = fetch) {
  async function post<T>(
    path: string,
    task: CommerceTaskIdentity,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: task.taskId,
        taskVersion: task.version,
        ...body,
      }),
    });
    const value = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(value.error?.message || "Pupu commerce request failed");
    }
    return value;
  }

  return {
    previewCart: (
      task: CommerceTaskIdentity,
      planId: string,
      products: ProductSummary[],
    ) => post<CartPreview>("/api/pupu/cart/preview", task, {
      planId,
      items: products.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    }),
    commitCart: (
      task: CommerceTaskIdentity,
      preview: Pick<CartPreview, "previewId" | "version">,
    ) => post<CartCommitResult>("/api/pupu/cart/commit", task, {
      ...preview,
      idempotencyKey: `cart-${crypto.randomUUID()}`,
    }),
    previewCheckout: (task: CommerceTaskIdentity) =>
      post<
        import("../components/pupu/PupuCheckoutJourney").CheckoutPreview &
        TaskResult
      >("/api/pupu/checkout/preview", task, {}),
    createInvitePay: (
      task: CommerceTaskIdentity,
      preview: { previewId: string; version: number },
    ) => post<
      import("../components/pupu/PupuCheckoutJourney").PaymentPresentation &
      TaskResult
    >("/api/pupu/checkout/create-invite-pay", task, {
      ...preview,
      idempotencyKey: `order-${crypto.randomUUID()}`,
    }),
  };
}
