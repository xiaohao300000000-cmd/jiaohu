import { describe, expect, it, vi } from "vitest";
import { createPupuAddressClient } from "./pupu-address-client";

describe("Pupu address client", () => {
  it("loads only redacted saved addresses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      addresses: [{ id: "receiver-a", label: "地址 1", region: "已保存区域",
        detailHint: "3 栋 1201", phoneSuffix: "" }],
    }));
    const client = createPupuAddressClient(fetcher);
    await expect(client.list()).resolves.toEqual({
      addresses: [{ id: "receiver-a", label: "地址 1", region: "已保存区域",
        detailHint: "3 栋 1201", phoneSuffix: "" }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/pupu/addresses",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("selects through the dedicated endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      selected: true, addressId: "receiver-a",
    }));
    const client = createPupuAddressClient(fetcher);
    await client.select("receiver-a");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/pupu/addresses/select",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ receiverId: "receiver-a" }),
      }),
    );
  });

  it("rejects provider fields that contain full address data", async () => {
    const client = createPupuAddressClient(vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ addresses: [{ id: "a", address: "secret" }] }),
    ));
    await expect(client.list()).rejects.toThrow("address response");
  });
});
