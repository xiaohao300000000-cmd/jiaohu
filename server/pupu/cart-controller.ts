import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { TaskSnapshot } from "../../src/domain/task-contract";
import { executeCommerceCommand } from "./commerce-cli";
import type { AddressSelection, PupuCommerceScope } from "./commerce-types";

export interface CartPreviewItem {
  productId: string;
  providerProductId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface CartConfirmationPayload {
  planId: string;
  binding: AddressSelection;
  items: CartPreviewItem[];
  totalCents: number;
}

export interface CartCommitResult {
  status: "verified";
  confirmationId: string;
  cartItems: Array<{ productId: string; name: string; quantity: number }>;
}

interface Options {
  execute?: typeof executeCommerceCommand;
  writeItem?: (root: string, value: unknown) => Promise<string>;
}

function sameBinding(left: AddressSelection, right: AddressSelection): boolean {
  return left.receiverId === right.receiverId &&
    left.storeId === right.storeId &&
    left.placeId === right.placeId &&
    left.placeZip === right.placeZip;
}

async function privateItemFile(root: string, value: unknown): Promise<string> {
  const directory = join(root, "commerce-items");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `item-${randomUUID()}.json`);
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value), "utf8");
  } finally {
    await handle.close();
  }
  return path;
}

export class PupuCartController {
  private readonly execute: typeof executeCommerceCommand;
  private readonly writeItem: (root: string, value: unknown) => Promise<string>;

  constructor(options: Options = {}) {
    this.execute = options.execute || executeCommerceCommand;
    this.writeItem = options.writeItem || privateItemFile;
  }

  preview(
    task: TaskSnapshot,
    binding: AddressSelection,
  ): CartConfirmationPayload {
    if (!task.finalPlan || task.context.selectedProducts.length === 0) {
      throw new Error("Current Pupu FinalPlan was not found");
    }
    const taskBinding = task.context.addressBinding;
    if (
      !taskBinding ||
      taskBinding.placeZip === undefined ||
      !sameBinding({ ...taskBinding, placeZip: taskBinding.placeZip }, binding)
    ) {
      throw new Error("Pupu address changed after planning");
    }
    if (task.context.selectedProducts.length > 40) {
      throw new Error("Cart items are invalid");
    }
    const items = task.context.selectedProducts.map((product) => {
      if (
        !Number.isSafeInteger(product.quantity) ||
        product.quantity < 1 ||
        product.quantity > 20
      ) {
        throw new Error("Cart quantity is invalid");
      }
      const totalCents = product.unitPriceCents * product.quantity;
      if (!Number.isSafeInteger(totalCents)) {
        throw new Error("Cart total is invalid");
      }
      return {
        productId: product.productId,
        providerProductId: product.providerProductId,
        name: product.name,
        quantity: product.quantity,
        unitPriceCents: product.unitPriceCents,
        totalCents,
      };
    });
    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
    if (
      !Number.isSafeInteger(totalCents) ||
      totalCents !== task.finalPlan.totalCents
    ) {
      throw new Error("FinalPlan total does not match selected products");
    }
    return {
      planId: task.finalPlan.planId,
      binding,
      items,
      totalCents,
    };
  }

  async commit(
    scope: PupuCommerceScope,
    binding: AddressSelection,
    actorId: string,
    confirmationId: string,
    payload: CartConfirmationPayload,
  ): Promise<CartCommitResult> {
    if (!sameBinding(payload.binding, binding)) {
      throw new Error("Pupu address changed before cart confirmation");
    }
    for (const item of payload.items) {
      const itemPath = await this.writeItem(scope.dataRoot, {
        store_product_id: item.productId,
        product_id: item.providerProductId || null,
        quantity: item.quantity,
        price_cents: item.unitPriceCents,
      });
      try {
        const result = await this.execute(scope, {
          kind: "addCartItem",
          binding,
          requestId: `cart-add-${randomUUID()}`,
          actorId,
          itemPath,
        });
        if (
          result.ok === false ||
          result.status === "failed" ||
          result.data?.status !== "verified"
        ) {
          throw new Error("Pupu could not verify the cart update");
        }
      } finally {
        await unlink(itemPath).catch(() => undefined);
      }
    }
    const cart = await this.execute(scope, {
      kind: "readCart",
      binding,
      requestId: `cart-read-${randomUUID()}`,
    });
    if (cart.ok === false || cart.status === "failed") {
      throw new Error("Pupu could not verify the cart update");
    }
    const cartItems = (
      cart.data?.items ||
      cart.data?.cart?.items ||
      []
    ).map((entry) => ({
      productId: entry.sku?.store_product_id || "",
      name: entry.sku?.name || "商品",
      quantity: entry.quantity || 0,
    })).filter((entry) => entry.productId);
    return { status: "verified", confirmationId, cartItems };
  }
}
