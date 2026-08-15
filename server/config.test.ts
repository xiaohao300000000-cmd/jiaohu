import { describe, expect, it } from "vitest";
import { getHermesConfig } from "./config";

describe("getHermesConfig", () => {
  it("returns the Hermes API connection", () => {
    expect(getHermesConfig({})).toEqual({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: undefined,
      ownerSessionKey: "owner-household-f3f3b74a55ae8bf60b6c1172",
    });
  });

  it("reads an explicit Hermes API key", () => {
    expect(getHermesConfig({
      HERMES_BASE_URL: "http://localhost:9000",
      HERMES_API_KEY: "test-key",
      PUPU_OWNER_ID: "owner-shared-across-devices",
    })).toEqual({
      baseUrl: "http://localhost:9000",
      apiKey: "test-key",
      ownerSessionKey: "owner-owner-shared-across-devices",
    });
  });
  it("returns the restored Pupu login runtime configuration", async () => {
    const { getPupuLoginConfig } = await import("./config");
    expect(getPupuLoginConfig({
      APP_PUBLIC_ORIGIN: "https://38.76.171.131:8443",
    })).toEqual({
      cliPath: "/home/pupu/providers/pupu-cli/.venv/bin/pupu",
      dataRoot: "/home/pupu/providers/pupu-cli/.local/private",
      accountsRoot: "/home/pupu/.local/share/jiaohu/pupu-accounts",
      runtimeRoot: "/home/pupu/.local/state/jiaohu/pupu-login",
      publicOrigin: "https://38.76.171.131:8443",
      attemptTtlMs: 600000,
      resendCooldownMs: 60000,
    });
  });

});
