import { describe, expect, it, vi } from "vitest";
import { PupuSessionStore } from "./session-store";
import { handlePupuAddressRequest } from "./address-router";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Pupu address router", () => {
  it("lists redacted addresses for the current browser session", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-address-"));
    const sessionStore = new PupuSessionStore({
      root: join(root, "sessions"), accountsRoot: join(root, "accounts"),
    });
    const session = await sessionStore.resolve(undefined);
    const controller = { list: vi.fn().mockResolvedValue({
      addresses: [{ id: "receiver-a", label: "地址 1", region: "已保存区域",
        detailHint: "3 栋 1201", phoneSuffix: "" }],
    }), select: vi.fn() };
    const response = await handlePupuAddressRequest(
      new Request("http://localhost/api/pupu/addresses", {
        headers: { cookie: `pupu_session=${session.token}` },
      }),
      {
        sessionStore, controller: controller as never,
        config: { cliPath: "/opt/pupu", accountsRoot: join(root, "accounts"),
          dataRoot: join(root, "data") },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      addresses: [{ id: "receiver-a", label: "地址 1", region: "已保存区域",
        detailHint: "3 栋 1201", phoneSuffix: "" }],
    });
    expect(controller.list).toHaveBeenCalledWith(expect.objectContaining({
      accountId: session.accountId,
    }));
  });

  it("selects only through the account-scoped controller cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-address-"));
    const sessionStore = new PupuSessionStore({
      root: join(root, "sessions"), accountsRoot: join(root, "accounts"),
    });
    const session = await sessionStore.resolve(undefined);
    const controller = { list: vi.fn(), select: vi.fn().mockResolvedValue({
      receiverId: "receiver-a", storeId: "store-a",
      placeId: "place-a", placeZip: 350100,
    }) };
    const response = await handlePupuAddressRequest(
      new Request("http://localhost/api/pupu/addresses/select", {
        method: "POST", headers: {
          cookie: `pupu_session=${session.token}`,
          "content-type": "application/json",
        }, body: JSON.stringify({ receiverId: "receiver-a" }),
      }),
      {
        sessionStore, controller: controller as never,
        config: { cliPath: "/opt/pupu", accountsRoot: join(root, "accounts"),
          dataRoot: join(root, "data") },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ selected: true, addressId: "receiver-a" });
    expect(controller.select).toHaveBeenCalledWith(expect.objectContaining({ accountId: session.accountId }), "receiver-a");
  });
});
