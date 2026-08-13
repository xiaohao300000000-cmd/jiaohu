import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ProductSummary } from "../../src/components/agent/agent-ui-event";
import { executeCommerceCommand } from "./commerce-cli";
import type { AddressSelection, PupuCommerceScope } from "./commerce-types";

interface Plan {
  accountId: string;
  planId: string;
  binding: AddressSelection;
  products: Map<string, ProductSummary>;
}
export interface CartPreviewItem {
  productId: string;
  providerProductId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}
export interface CartPreview {
  previewId: string;
  version: number;
  planId: string;
  accountId: string;
  binding: AddressSelection;
  items: CartPreviewItem[];
  totalCents: number;
}
export interface CartCommitResult {
  status: "verified";
  previewId: string;
  cartItems: Array<{ productId: string; name: string; quantity: number }>;
}
interface Options {
  execute?: typeof executeCommerceCommand;
  writeItem?: (root: string, value: unknown) => Promise<string>;
}

function sameBinding(left: AddressSelection, right: AddressSelection): boolean {
  return left.receiverId === right.receiverId && left.storeId === right.storeId &&
    left.placeId === right.placeId && left.placeZip === right.placeZip;
}
async function privateItemFile(root: string, value: unknown): Promise<string> {
  const directory = join(root, "commerce-items");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `item-${randomUUID()}.json`);
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value), "utf8"); }
  finally { await handle.close(); }
  return path;
}
export class PupuCartController {
  private readonly execute: typeof executeCommerceCommand;
  private readonly writeItem: (root: string, value: unknown) => Promise<string>;
  private readonly plans = new Map<string, Plan>();
  private readonly previews = new Map<string, CartPreview>();
  private readonly commits = new Map<string, Promise<CartCommitResult>>();

  constructor(options: Options = {}) {
    this.execute = options.execute || executeCommerceCommand;
    this.writeItem = options.writeItem || privateItemFile;
  }

  registerPlan(accountId: string, planId: string, binding: AddressSelection, products: ProductSummary[]): void {
    this.plans.set(`${accountId}:${planId}`, {
      accountId, planId, binding, products: new Map(products.map((item) => [item.productId, item])),
    });
  }

  preview(accountId: string, binding: AddressSelection, planId: string, requested: Array<{ productId: string; quantity: number }>): CartPreview {
    const plan = this.plans.get(`${accountId}:${planId}`);
    if (!plan) throw new Error("Current Pupu plan was not found");
    if (!sameBinding(plan.binding, binding)) throw new Error("Pupu address changed after planning");
    if (!requested.length || requested.length > 40) throw new Error("Cart items are invalid");
    const items = requested.map(({ productId, quantity }) => {
      const product = plan.products.get(productId);
      if (!product || product.stockStatus === "out_of_stock") throw new Error("Plan product is unavailable");
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Cart quantity is invalid");
      const unitPriceCents = Math.round(product.unitPrice * 100);
      return {
        productId, providerProductId: product.providerProductId, name: product.name, quantity,
        unitPriceCents, totalCents: unitPriceCents * quantity,
      };
    });
    const preview: CartPreview = {
      previewId: `cart-${randomUUID()}`, version: 1, planId, accountId, binding,
      items, totalCents: items.reduce((sum, item) => sum + item.totalCents, 0),
    };
    this.previews.set(preview.previewId, preview);
    return preview;
  }

  async commit(scope: PupuCommerceScope, binding: AddressSelection, actorId: string, input: {
    previewId: string; version: number; idempotencyKey: string;
  }): Promise<CartCommitResult> {
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(input.idempotencyKey)) throw new Error("Idempotency key is invalid");
    const key = `${scope.accountId}:${input.idempotencyKey}`;
    const existing = this.commits.get(key);
    if (existing) return existing;
    const operation = this.performCommit(scope, binding, actorId, input);
    this.commits.set(key, operation);
    try { return await operation; }
    catch (error) { this.commits.delete(key); throw error; }
  }

  private async performCommit(scope: PupuCommerceScope, binding: AddressSelection, actorId: string, input: {
    previewId: string; version: number;
  }): Promise<CartCommitResult> {
    const preview = this.previews.get(input.previewId);
    if (!preview || preview.accountId !== scope.accountId) throw new Error("Cart preview was not found");
    if (preview.version !== input.version) throw new Error("Cart preview version changed");
    if (!sameBinding(preview.binding, binding)) throw new Error("Pupu address changed before cart confirmation");
    for (const item of preview.items) {
      const itemPath = await this.writeItem(scope.dataRoot, {
        store_product_id: item.productId,
        product_id: item.providerProductId || null,
        quantity: item.quantity,
        price_cents: item.unitPriceCents,
      });
      try {
        const result = await this.execute(scope, {
          kind: "addCartItem", binding, requestId: `cart-add-${randomUUID()}`,
          actorId, itemPath,
        });
        if (result.ok === false || result.status === "failed" || result.data?.status !== "verified") {
          throw new Error("Pupu could not verify the cart update");
        }
      } finally {
        await unlink(itemPath).catch(() => undefined);
      }
    }
    const cart = await this.execute(scope, {
      kind: "readCart", binding, requestId: `cart-read-${randomUUID()}`,
    });
    const cartItems = (cart.data?.items || cart.data?.cart?.items || []).map((entry) => ({
      productId: entry.sku?.store_product_id || "",
      name: entry.sku?.name || "商品",
      quantity: entry.quantity || 0,
    })).filter((entry) => entry.productId);
    return { status: "verified", previewId: preview.previewId, cartItems };
  }
}
