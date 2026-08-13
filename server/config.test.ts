import { describe, expect, it } from "vitest";
import { getPupuLoginConfig } from "./config";

describe("getPupuLoginConfig", () => {
  it("returns private absolute defaults and validated durations", () => {
    const config = getPupuLoginConfig({});
    expect(config.cliPath).toMatch(/^\//);
    expect(config.accountsRoot).toMatch(/^\//);
    expect(config.runtimeRoot).toMatch(/^\//);
    expect(config.attemptTtlMs).toBe(10 * 60_000);
    expect(config.resendCooldownMs).toBe(60_000);
  });

  it("rejects relative roots and invalid durations", () => {
    expect(() => getPupuLoginConfig({ PUPU_ACCOUNTS_ROOT: "../shared" })).toThrow("absolute");
    expect(() => getPupuLoginConfig({ PUPU_LOGIN_ATTEMPT_TTL_SECONDS: "0" })).toThrow("TTL");
    expect(() => getPupuLoginConfig({ PUPU_LOGIN_RESEND_COOLDOWN_SECONDS: "nope" })).toThrow("cooldown");
  });
});

