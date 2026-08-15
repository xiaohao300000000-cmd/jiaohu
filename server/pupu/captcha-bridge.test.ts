import { describe, expect, it, vi } from "vitest";
import { CaptchaBridge } from "./captcha-bridge";

describe("CaptchaBridge", () => {
  it("binds a loopback challenge to one session and hides its origin", async () => {
    const helperHtml =
      "<script>fetch('/challenge/abcdefghijklmnopqrstuvwxyz123456/result')</script>";
    const fetcher = vi.fn().mockResolvedValue(new Response(helperHtml, {
      status: 200, headers: { "content-type": "text/html" },
    }));
    const bridge = new CaptchaBridge({ fetch: fetcher, now: () => 1000 });
    bridge.register("session-a", "attempt-a", "http://127.0.0.1:3210/challenge/abcdefghijklmnopqrstuvwxyz123456", 2000);

    const response = await bridge.forward("session-a", "attempt-a", "GET", "");
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/challenge/abcdefghijklmnopqrstuvwxyz123456",
      expect.objectContaining({ method: "GET" }),
    );
    const responseHtml = await response.text();
    expect(responseHtml).toContain("/api/pupu/login/captcha/attempt-a/result");
    expect(responseHtml).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const policy = response.headers.get("content-security-policy") || "";
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("https://gcaptcha4.geetest.com");
    expect(policy).toContain("https://gcaptcha4.geevisit.com");
    expect(policy).toContain("https://gcaptcha4.gsensebot.com");
    expect(policy).toContain("img-src 'self' data: blob: https:");
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https:");
    expect(policy).toContain("frame-src 'self' https:");
    expect(JSON.stringify(bridge.inspect("session-a", "attempt-a"))).not.toContain("3210");
  });

  it("rejects cross-session, unsafe routes, non-loopback helpers, expiry, and replay", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    let now = 1000;
    const bridge = new CaptchaBridge({ fetch: fetcher, now: () => now });
    expect(() => bridge.register("s", "a", "https://evil.example/challenge/x", 2000)).toThrow("loopback");
    bridge.register("session-a", "attempt-a", "http://127.0.0.1:3210/challenge/abcdefghijklmnopqrstuvwxyz123456", 2000);

    await expect(bridge.forward("session-b", "attempt-a", "GET", "")).rejects.toThrow("not found");
    await expect(bridge.forward("session-a", "attempt-a", "GET", "/admin")).rejects.toThrow("route");
    await bridge.forward("session-a", "attempt-a", "POST", "/result", new Uint8Array([123, 125]));
    await expect(bridge.forward("session-a", "attempt-a", "POST", "/result")).rejects.toThrow("not found");

    bridge.register("session-a", "attempt-b", "http://127.0.0.1:3211/challenge/zyxwvutsrqponmlkjihgfedcba654321", 2000);
    now = 2001;
    await expect(bridge.forward("session-a", "attempt-b", "GET", "")).rejects.toThrow("expired");
  });
});
