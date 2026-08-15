import { describe, expect, it } from "vitest";
import { buildLoginCommand, redactProviderValue } from "./cli-runner";

const scope = {
  cliPath: "/opt/pupu",
  householdId: "household-shared-owner",
  dataRoot: "/srv/data",
};

describe("Pupu login CLI runner", () => {
  it("builds allowlisted argv and keeps OTP on stdin", () => {
    const command = buildLoginCommand(scope, { kind: "verify", code: "123456" });
    expect(command.argv).toEqual([
      "/opt/pupu", "login", "verify-code", "--code-stdin", "--allow-session-rotation",
      "--household-id", scope.householdId, "--data-root", scope.dataRoot, "--json",
    ]);
    expect(command.stdin).toBe("123456\n");
    expect(command.argv).not.toContain("123456");
  });

  it("allows phone only on request-code and rejects unsafe scope", () => {
    const command = buildLoginCommand(scope, { kind: "request", phone: "13000000000" });
    expect(command.argv).toContain("--phone");
    expect(command.argv).toContain("13000000000");
    expect(() => buildLoginCommand(
      { ...scope, householdId: "../other" }, { kind: "status" },
    )).toThrow("household");
  });

  it("preserves the provider login session across captcha and SMS requests", () => {
    const loginSessionId = "11111111-2222-4333-8444-555555555555";
    const command = buildLoginCommand(scope, {
      kind: "request", phone: "13000000000", loginSessionId,
    });
    expect(command.argv).toContain("--login-session-id");
    expect(command.argv).toContain(loginSessionId);
    expect(() => buildLoginCommand(scope, {
      kind: "request", phone: "13000000000", loginSessionId: "../unsafe",
    })).toThrow("session");
  });

  it("redacts nested login secrets", () => {
    expect(redactProviderValue({
      phone: "secret",
      data: { code: "secret", token: "secret", status: "safe" },
    })).toEqual({ data: { status: "safe" } });
  });
});
