import { describe, expect, it } from "vitest";
import {
  assertMutationRequest,
  loginCookie,
  noStoreHeaders,
  readCookie,
} from "./http-security";

describe("Pupu login HTTP security", () => {
  it("creates an opaque HttpOnly production cookie", () => {
    const value = loginCookie("opaque-token", true);
    expect(value).toContain("pupu_session=opaque-token");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Secure");
    expect(value).not.toContain("phone");
    expect(readCookie(value, "pupu_session")).toBe("opaque-token");
  });

  it("requires same-origin JSON mutation requests", () => {
    const good = new Request("https://app.example/api/pupu/login/start", {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
    });
    expect(() => assertMutationRequest(good, "https://app.example")).not.toThrow();

    const crossOrigin = new Request(good.url, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
    });
    expect(() => assertMutationRequest(crossOrigin, "https://app.example")).toThrow("origin");

    const form = new Request(good.url, {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "text/plain" },
    });
    expect(() => assertMutationRequest(form, "https://app.example")).toThrow("JSON");
  });

  it("marks login and captcha responses private and non-cacheable", () => {
    expect(noStoreHeaders()).toMatchObject({
      "cache-control": "no-store, private",
      pragma: "no-cache",
    });
  });
});

