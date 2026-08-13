export interface PupuCommerceScope {
  cliPath: string;
  accountId: string;
  accountsRoot: string;
  dataRoot: string;
}
export interface AddressSelection {
  receiverId: string;
  storeId: string;
  placeId: string;
  placeZip: number;
}
interface BoundOperation { binding: AddressSelection; requestId: string }
export type CommerceOperation =
  | { kind: "listAddresses" }
  | (BoundOperation & { kind: "readCart" })
  | (BoundOperation & {
      kind: "addCartItem";
      actorId: string;
      itemPath: string;
      approvalToken?: string;
    })
  | (BoundOperation & { kind: "checkoutPreview" })
  | (BoundOperation & {
      kind: "checkoutCreate";
      previewId: string;
      actorId: string;
      approvalToken?: string;
    });
export interface ProviderAddress {
  id: string;
  label?: string;
  region?: string;
  address?: string;
  building_room_num?: string;
  mobile?: string;
  detailHint?: string;
  phoneSuffix?: string;
  service_store_id: string;
  place: { id: string; zip: number };
  lng_x?: string;
  lat_y?: string;
}
export interface SavedAddressSummary {
  id: string;
  label: string;
  region: string;
  detailHint: string;
  phoneSuffix: string;
}
export interface ProviderSku {
  store_product_id: string;
  product_id?: string | null;
  name: string;
  price_cents: number;
  unit?: string | null;
  in_stock?: boolean;
}
export interface CommerceProviderResult {
  ok?: boolean;
  status?: string;
  data?: {
    addresses?: ProviderAddress[];
    items?: Array<{ sku?: ProviderSku; quantity?: number }>;
    status?: string;
    cart?: { items?: Array<{ sku?: ProviderSku; quantity?: number }> };
    requested?: unknown;
    [key: string]: unknown;
  };
  error?: { code?: string; message?: string; retryable?: boolean };
}
