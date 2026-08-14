import { executeCommerceCommand } from "./commerce-cli";
import type { AddressSelection, PupuCommerceScope } from "./commerce-types";
import { validateOfficialPaymentTarget } from "./payment-link";

export interface CheckoutPreviewPresentation {
  previewId: string;
  version: number;
  addressHint: string;
  lines: Array<{ name: string; quantity: number; priceCents: number }>;
  productTotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  payableCents: number;
  deliveryHint?: string;
  expiresAt: string;
}

export interface PaymentPresentation {
  checkoutId: string;
  status: "WAITING_PAY";
  payableCents: number;
  paymentTarget: string;
  expiresAt?: string;
}

interface Options {
  execute?: typeof executeCommerceCommand;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

export class PupuCheckoutController {
  private readonly execute: typeof executeCommerceCommand;

  constructor(options: Options = {}) {
    this.execute = options.execute || executeCommerceCommand;
  }

  async preview(
    scope: PupuCommerceScope,
    binding: AddressSelection,
  ): Promise<CheckoutPreviewPresentation> {
    const result = await this.execute(scope, {
      kind: "checkoutPreview",
      binding,
      requestId: `checkout-${crypto.randomUUID()}`,
    });
    if (result.ok === false || result.status === "failed") {
      throw new Error("Pupu settlement preview failed");
    }
    const data = record(result.data);
    if (
      data.receiver_id !== binding.receiverId ||
      data.store_id !== binding.storeId ||
      data.place_id !== binding.placeId
    ) {
      throw new Error("Pupu settlement address binding changed");
    }
    const previewId = String(data.preview_id || "");
    const lines = Array.isArray(data.lines)
      ? data.lines.map((line) => {
          const item = record(line);
          return {
            name: String(item.name || "商品"),
            quantity: Number(item.quantity || 0),
            priceCents: Number(item.price || 0),
          };
        })
      : [];
    if (!previewId || !lines.length) {
      throw new Error("Pupu settlement preview is incomplete");
    }
    return {
      previewId,
      version: 1,
      addressHint: "已选择的朴朴地址",
      lines,
      productTotalCents: Number(data.product_total_price || 0),
      deliveryFeeCents: Number(data.logistics_fee || 0),
      discountCents: Number(data.total_discount_amount || 0),
      payableCents: Number(data.total_amount || 0),
      deliveryHint:
        typeof data.selected_delivery_text === "string"
          ? data.selected_delivery_text
          : undefined,
      expiresAt: String(data.expires_at || ""),
    };
  }

  async create(
    scope: PupuCommerceScope,
    binding: AddressSelection,
    actorId: string,
    preview: CheckoutPreviewPresentation,
  ): Promise<PaymentPresentation> {
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      throw new Error("Checkout preview expired");
    }
    const result = await this.execute(scope, {
      kind: "checkoutCreate",
      binding,
      requestId: preview.previewId,
      previewId: preview.previewId,
      actorId,
    });
    if (result.ok === false || result.status === "failed") {
      throw new Error("Pupu real order outcome is not confirmed");
    }
    const data = record(result.data);
    const invite = record(data.invite_pay);
    const share = record(data.share);
    const order = record(data.order);
    const invitePayId = String(invite.invite_pay_id || "");
    const orderId = String(order.order_id || "");
    const inviteStatus =
      invite.status == null || invite.status === ""
        ? "WAITING_PAY"
        : String(invite.status);
    if (
      !invitePayId ||
      !orderId ||
      invite.order_id !== orderId ||
      inviteStatus !== "WAITING_PAY"
    ) {
      throw new Error("Pupu pending-payment order is incomplete");
    }
    const paymentTarget = validateOfficialPaymentTarget(
      String(share.url || share.path || ""),
      invitePayId,
    );
    return {
      checkoutId: preview.previewId,
      status: "WAITING_PAY",
      payableCents: preview.payableCents,
      paymentTarget,
      expiresAt:
        typeof invite.expires_at === "string"
          ? invite.expires_at
          : undefined,
    };
  }
}
