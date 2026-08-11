import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PupuSessionStore } from "./session-store";
import { handlePupuLoginRequest } from "./login-router";

function setup() {
  return mkdtemp(join(tmpdir(), "pupu-router-")).then((root) => {
    const sessionStore = new PupuSessionStore({ root, accountsRoot: join(root, "accounts") });
    const controller = {
      status: vi.fn().mockResolvedValue({ phase: "auth_required" }),
      start: vi.fn().mockResolvedValue({ phase: "sms", attemptId: "attempt-1" }),
      completeCaptcha: vi.fn().mockResolvedValue({ phase: "sms", attemptId: "attempt-1" }),
      verify: vi.fn().mockResolvedValue({ phase: "connected" }),
      resend: vi.fn(),
      cancel: vi.fn().mockReturnValue({ phase: "auth_required" }),
      captchaBridge: { forward: vi.fn() },
    };
    return {
      sessionStore,
      controller,
      config: {
        cliPath: "/opt/pupu", dataRoot: "/srv/data", accountsRoot: join(root, "accounts"),
        publicOrigin: "https://app.example",
      },
    };
  });
}

describe("Pupu login router", () => {
  it("creates an opaque cookie and returns no-store auth status", async () => {
    const deps = await setup();
    const response = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/status"), deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ phase: "auth_required" });
  });

  it("binds start input to the cookie session without echoing phone", async () => {
    const deps = await setup();
    const status = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/status"), deps,
    );
    const cookie = status.headers.get("set-cookie")!.split(";", 1)[0];
    const response = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/start", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json", cookie },
        body: JSON.stringify({ phone: "13000000000" }),
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("13000000000");
    expect(deps.controller.start).toHaveBeenCalledWith(
      expect.stringMatching(/^acct_/), expect.objectContaining({ accountId: expect.stringMatching(/^acct_/) }),
      "13000000000", expect.any(AbortSignal),
    );
  });
  it("routes captcha completion to the controller instead of the bridge", async () => {
    const deps = await setup();
    const response = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/captcha/complete", {
        method: "POST",
        headers: {
          origin: "https://app.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.controller.completeCaptcha).toHaveBeenCalledOnce();
    expect(deps.controller.captchaBridge.forward).not.toHaveBeenCalled();
  });

  it("forwards the controller-generated trailing-slash captcha URL", async () => {
    const deps = await setup();
    deps.controller.captchaBridge.forward.mockResolvedValue(
      new Response("<html>slider</html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    const status = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/status"), deps,
    );
    const cookie = status.headers.get("set-cookie")!.split(";", 1)[0];
    const response = await handlePupuLoginRequest(
      new Request(
        "https://app.example/api/pupu/login/captcha/attempt-1/",
        { headers: { cookie } },
      ),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("slider");
    expect(deps.controller.captchaBridge.forward).toHaveBeenCalledWith(
      expect.stringMatching(/^acct_/),
      "attempt-1",
      "GET",
      "",
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("rejects cross-origin mutations before the controller", async () => {
    const deps = await setup();
    const response = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/start", {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ phone: "13000000000" }),
      }),
      deps,
    );
    expect(response.status).toBe(403);
    expect(deps.controller.start).not.toHaveBeenCalled();

  });
  it("cancels only the transient login attempt and keeps the account session", async () => {
    const deps = await setup();
    const status = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/status"), deps,
    );
    const cookie = status.headers.get("set-cookie")!.split(";", 1)[0];
    const token = cookie.split("=", 2)[1];
    const before = await deps.sessionStore.resolve(token);
    const response = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/cancel", {
        method: "POST",
        headers: {
          origin: "https://app.example",
          "content-type": "application/json",
          cookie,
        },
        body: "{}",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ phase: "auth_required" });
    expect(deps.controller.cancel).toHaveBeenCalledWith(before.accountId);
    expect((await deps.sessionStore.resolve(token)).accountId).toBe(before.accountId);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("logs out only the cookie-bound account and clears the cookie", async () => {
    const deps = await setup();
    const status = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/status"), deps,
    );
    const cookie = status.headers.get("set-cookie")!.split(";", 1)[0];
    const token = cookie.split("=", 2)[1];
    const before = await deps.sessionStore.resolve(token);
    const response = await handlePupuLoginRequest(
      new Request("https://app.example/api/pupu/login/session", {
        method: "DELETE",
        headers: {
          origin: "https://app.example",
          "content-type": "application/json",
          cookie,
        },
        body: "{}",
      }),
      deps,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(deps.controller.cancel).toHaveBeenCalledWith(before.accountId);
    expect((await deps.sessionStore.resolve(token)).accountId).not.toBe(before.accountId);
  });
});

