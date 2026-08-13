import { randomUUID } from "node:crypto";
import { executeCommerceCommand } from "./commerce-cli";
import type { AddressSelection, PupuCommerceScope } from "./commerce-types";
import { validateOfficialPaymentTarget } from "./payment-link";

export interface CheckoutPreviewPresentation {
  previewId: string; version: number; addressHint: string;
  lines: Array<{ name: string; quantity: number; priceCents: number }>;
  productTotalCents: number; deliveryFeeCents: number; discountCents: number;
  payableCents: number; deliveryHint?: string; expiresAt: string;
}
export interface PaymentPresentation {
  checkoutId: string; status: "WAITING_PAY"; payableCents: number;
  paymentTarget: string; expiresAt?: string;
}
interface Options { execute?: typeof executeCommerceCommand }
interface Stored { scopeAccountId: string; binding: AddressSelection; preview: CheckoutPreviewPresentation }
function sameBinding(left: AddressSelection, right: AddressSelection): boolean {
  return left.receiverId === right.receiverId && left.storeId === right.storeId &&
    left.placeId === right.placeId && left.placeZip === right.placeZip;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
export class PupuCheckoutController {
  private readonly execute: typeof executeCommerceCommand;
  private readonly previews = new Map<string, Stored>();
  private readonly creations = new Map<string, Promise<PaymentPresentation>>();
  constructor(options: Options = {}) { this.execute = options.execute || executeCommerceCommand; }

  async preview(scope: PupuCommerceScope, binding: AddressSelection): Promise<CheckoutPreviewPresentation> {
    const requestId = `checkout-${randomUUID()}`;
    const result = await this.execute(scope, { kind: "checkoutPreview", binding, requestId });
    if (result.ok === false || result.status === "failed") throw new Error("Pupu settlement preview failed");
    const data = record(result.data);
    if (data.receiver_id !== binding.receiverId || data.store_id !== binding.storeId || data.place_id !== binding.placeId) {
      throw new Error("Pupu settlement address binding changed");
    }
    const previewId = String(data.preview_id || "");
    const lines = Array.isArray(data.lines) ? data.lines.map((line) => {
      const item = record(line);
      return { name: String(item.name || "商品"), quantity: Number(item.quantity || 0), priceCents: Number(item.price || 0) };
    }) : [];
    if (!previewId || !lines.length) throw new Error("Pupu settlement preview is incomplete");
    const preview: CheckoutPreviewPresentation = {
      previewId, version: 1, addressHint: "已选择的朴朴地址", lines,
      productTotalCents: Number(data.product_total_price || 0),
      deliveryFeeCents: Number(data.logistics_fee || 0),
      discountCents: Number(data.total_discount_amount || 0),
      payableCents: Number(data.total_amount || 0),
      deliveryHint: typeof data.selected_delivery_text === "string" ? data.selected_delivery_text : undefined,
      expiresAt: String(data.expires_at || ""),
    };
    this.previews.set(previewId, { scopeAccountId: scope.accountId, binding, preview });
    return preview;
  }

  async create(scope: PupuCommerceScope, binding: AddressSelection, actorId: string, input: {
    previewId: string; version: number; idempotencyKey: string;
  }): Promise<PaymentPresentation> {
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(input.idempotencyKey)) throw new Error("Order idempotency key is invalid");
    const key = `${scope.accountId}:${input.idempotencyKey}`;
    const existing = this.creations.get(key);
    if (existing) return existing;
    const pending = this.performCreate(scope, binding, actorId, input);
    this.creations.set(key, pending);
    try { return await pending; }
    catch (error) { this.creations.delete(key); throw error; }
  }

  private async performCreate(scope: PupuCommerceScope, binding: AddressSelection, actorId: string, input: {
    previewId: string; version: number;
  }): Promise<PaymentPresentation> {
    const stored = this.previews.get(input.previewId);
    if (!stored || stored.scopeAccountId !== scope.accountId) throw new Error("Checkout preview was not found");
    if (input.version !== stored.preview.version) throw new Error("Checkout preview version changed");
    if (!sameBinding(stored.binding, binding)) throw new Error("Pupu address changed before order confirmation");
    if (Date.parse(stored.preview.expiresAt) <= Date.now()) throw new Error("Checkout preview expired");
    const result = await this.execute(scope, {
      kind: "checkoutCreate", binding, requestId: input.previewId, previewId: input.previewId, actorId,
    });
    if (result.ok === false || result.status === "failed") throw new Error("Pupu real order outcome is not confirmed");
    const data = record(result.data);
    const invite = record(data.invite_pay);
    const share = record(data.share);
    const order = record(data.order);
    const invitePayId = String(invite.invite_pay_id || "");
    const orderId = String(order.order_id || "");
    if (!invitePayId || !orderId || invite.order_id !== orderId || String(invite.status) !== "WAITING_PAY") {
      throw new Error("Pupu pending-payment order is incomplete");
    }
    const paymentTarget = validateOfficialPaymentTarget(String(share.url || share.path || ""), invitePayId);
    return {
      checkoutId: input.previewId, status: "WAITING_PAY",
      payableCents: stored.preview.payableCents, paymentTarget,
      expiresAt: typeof invite.expires_at === "string" ? invite.expires_at : undefined,
    };
  }
}
