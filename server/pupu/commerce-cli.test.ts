import { describe, expect, it } from "vitest";
import { buildCommerceCommand } from "./commerce-cli";

const scope = {
  cliPath: "/opt/pupu",
  accountId: "acct_0123456789abcdef0123456789abcdef",
  accountsRoot: "/srv/accounts",
  dataRoot: "/srv/data",
};

describe("Pupu commerce CLI", () => {
  it("builds the allowlisted saved-address command", () => {
    expect(buildCommerceCommand(scope, { kind: "listAddresses" })).toEqual([
      "/opt/pupu", "address", "list",
      "--account-id", scope.accountId,
      "--accounts-root", scope.accountsRoot,
      "--data-root", scope.dataRoot,
      "--json",
    ]);
  });

  it("builds scoped cart and checkout commands without generic argv", () => {
    const binding = { receiverId: "receiver-a", storeId: "store-a", placeId: "place-a", placeZip: 350100 };
    expect(buildCommerceCommand(scope, { kind: "readCart", binding, requestId: "read-1" })).toContain("scoped-read");
    expect(buildCommerceCommand(scope, {
      kind: "addCartItem", binding, requestId: "add-1", actorId: "browser-session",
      itemPath: "/srv/runtime/item.json", approvalToken: "opaque-token",
    })).toContain("scoped-add");
    expect(buildCommerceCommand(scope, {
      kind: "checkoutPreview", binding, requestId: "preview-1",
    })).toContain("scoped-preview");
    expect(buildCommerceCommand(scope, {
      kind: "checkoutCreate", binding, requestId: "preview-1", previewId: "preview-1",
      actorId: "browser-session", approvalToken: "opaque-token",
    })).toContain("scoped-create-from-preview");
  });

  it("rejects unsafe address scope", () => {
    expect(() => buildCommerceCommand(
      { ...scope, accountId: "../other" },
      { kind: "listAddresses" },
    )).toThrow("scope");
  });

  it("has no generic arbitrary operation", () => {
    expect(() => buildCommerceCommand(scope, { kind: "raw" } as never))
      .toThrow("operation");
  });
});
