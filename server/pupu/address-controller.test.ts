import { describe, expect, it, vi } from "vitest";
import { PupuAddressController } from "./address-controller";

const scope = { cliPath: "/opt/pupu", accountId: "acct_0123456789abcdef0123456789abcdef", accountsRoot: "/srv/accounts", dataRoot: "/srv/data" };
const address = {
  id: "receiver-a", label: "家", region: "福州市鼓楼区",
  address: "福州市鼓楼区测试路 88 号", building_room_num: "3 栋 1201",
  mobile: "13000009501", service_store_id: "store-a",
  place: { id: "place-a", zip: 350100 },
  lng_x: "encrypted-longitude-secret", lat_y: "encrypted-latitude-secret",
};
const provider = { ok: true, status: "succeeded", data: { addresses: [address] } };

describe("PupuAddressController", () => {
  it("returns a redacted saved-address summary", async () => {
    const controller = new PupuAddressController({ execute: vi.fn().mockResolvedValue(provider) });
    const result = await controller.list(scope);
    expect(result).toEqual({ addresses: [{
      id: "receiver-a", label: "家", region: "福州市鼓楼区",
      detailHint: "3 栋 1201", phoneSuffix: "9501",
    }] });
    expect(JSON.stringify(result)).not.toContain("测试路");
    expect(JSON.stringify(result)).not.toContain("13000009501");
    expect(JSON.stringify(result)).not.toContain("encrypted-");
  });

  it("binds only an address returned for the current account", async () => {
    const controller = new PupuAddressController({ execute: vi.fn().mockResolvedValue(provider) });
    await controller.list(scope);
    expect(await controller.select(scope, "receiver-a")).toMatchObject({
      receiverId: "receiver-a", storeId: "store-a", placeId: "place-a", placeZip: 350100,
    });
    expect(controller.getSelection(scope.accountId)).toMatchObject({
      receiverId: "receiver-a", storeId: "store-a", placeId: "place-a",
    });
    await expect(controller.select(scope, "receiver-other")).rejects.toThrow("address");
  });

  it("keeps account address caches isolated", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(provider)
      .mockResolvedValueOnce({ ...provider, data: { addresses: [{
        ...address, id: "receiver-b", service_store_id: "store-b",
        place: { id: "place-b", zip: 350200 },
      }] } });
    const controller = new PupuAddressController({ execute });
    const other = { ...scope, accountId: "acct_abcdefabcdefabcdefabcdefabcdefab" };
    await controller.list(scope);
    await controller.list(other);
    await expect(controller.select(scope, "receiver-b")).rejects.toThrow("address");
    await expect(controller.select(other, "receiver-a")).rejects.toThrow("address");
  });

  it("fails when no saved address is deliverable", async () => {
    const controller = new PupuAddressController({ execute: vi.fn().mockResolvedValue({
      ok: false, status: "failed",
      error: { code: "address_unavailable", message: "No address is served" },
    }) });
    await expect(controller.list(scope)).rejects.toThrow("deliverable");
  });
});

  it("reuses a recent address read and refreshes it after five minutes", async () => {
    let now = 1_000;
    const execute = vi.fn().mockResolvedValue(provider);
    const controller = new PupuAddressController({
      execute,
      now: () => now,
      cacheTtlMs: 300_000,
    });

    await controller.list(scope);
    await controller.list(scope);
    expect(execute).toHaveBeenCalledTimes(1);

    now += 300_001;
    await controller.list(scope);
    expect(execute).toHaveBeenCalledTimes(2);
  });
