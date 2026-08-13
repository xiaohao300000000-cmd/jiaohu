export interface PupuCommerceScope {
  cliPath: string;
  accountId: string;
  accountsRoot: string;
  dataRoot: string;
}
export type CommerceOperation = { kind: "listAddresses" };
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
export interface AddressSelection {
  receiverId: string;
  storeId: string;
  placeId: string;
  placeZip: number;
}
export interface CommerceProviderResult {
  ok?: boolean;
  status?: string;
  data?: { addresses?: ProviderAddress[] };
  error?: { code?: string; message?: string };
}
