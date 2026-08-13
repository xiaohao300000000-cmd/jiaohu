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
