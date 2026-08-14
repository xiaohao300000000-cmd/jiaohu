import { executeCommerceCommand } from "./commerce-cli";
import type { AddressSelection, CommerceProviderResult, ProviderAddress, PupuCommerceScope, SavedAddressSummary } from "./commerce-types";
interface Options {
  execute?: typeof executeCommerceCommand;
  now?: () => number;
  cacheTtlMs?: number;
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : "" }
function redact(address: ProviderAddress): SavedAddressSummary {
  const mobile = text(address.mobile);
  return {
    id: text(address.id), label: text(address.label) || "收货地址",
    region: text(address.region) || "已保存区域",
    detailHint: text(address.detailHint) || text(address.building_room_num) || "详细地址已保护",
    phoneSuffix: text(address.phoneSuffix) || mobile.slice(-4),
  };
}
function isUsable(address: ProviderAddress): boolean {
  return Boolean(text(address.id) && text(address.service_store_id) &&
    text(address.place?.id) && Number.isInteger(address.place?.zip));
}
export class PupuAddressController {
  private readonly execute: typeof executeCommerceCommand;
  private readonly addresses = new Map<string, Map<string, ProviderAddress>>();
  private readonly addressExpiry = new Map<string, number>();
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  constructor(options: Options = {}) {
    this.execute = options.execute || executeCommerceCommand;
    this.now = options.now || Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? 300_000;
  }
  async list(scope: PupuCommerceScope): Promise<{ addresses: SavedAddressSummary[] }> {
    const cached = this.addresses.get(scope.accountId);
    if (cached && (this.addressExpiry.get(scope.accountId) || 0) > this.now()) {
      return { addresses: [...cached.values()].map(redact) };
    }
    const result: CommerceProviderResult = await this.execute(scope, { kind: "listAddresses" });
    const addresses = result.data?.addresses?.filter(isUsable) || [];
    if (result.ok === false || result.status === "failed" || addresses.length === 0) {
      throw new Error("No saved Pupu address is deliverable");
    }
    this.addresses.set(scope.accountId, new Map(addresses.map((address) => [address.id, address])));
    this.addressExpiry.set(scope.accountId, this.now() + this.cacheTtlMs);
    return { addresses: addresses.map(redact) };
  }
  async resolveSelection(scope: PupuCommerceScope, receiverId: string): Promise<AddressSelection> {
    const address = this.addresses.get(scope.accountId)?.get(receiverId);
    if (!address || !isUsable(address)) throw new Error("Saved address is not available for this account");
    const selection = {
      receiverId: address.id, storeId: address.service_store_id,
      placeId: address.place.id, placeZip: address.place.zip,
    };
    return selection;
  }
}
