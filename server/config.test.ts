import { describe, expect, it } from "vitest";
import { getHermesConfig } from "./config";

describe("getHermesConfig", () => {
  it("returns the Hermes API connection", () => {
    expect(getHermesConfig({})).toEqual({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: undefined,
    });
  });

  it("reads an explicit Hermes API key", () => {
    expect(getHermesConfig({
      HERMES_BASE_URL: "http://localhost:9000",
      HERMES_API_KEY: "test-key",
    })).toEqual({
      baseUrl: "http://localhost:9000",
      apiKey: "test-key",
    });
  });
});
