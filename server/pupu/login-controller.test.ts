import { describe, expect, it, vi } from "vitest";
import { PupuLoginController } from "./login-controller";
import { CaptchaBridge } from "./captcha-bridge";

const scope = {
  cliPath: "/opt/pupu",
  accountId: "acct_0123456789abcdef0123456789abcdef",
  accountsRoot: "/srv/accounts",
  dataRoot: "/srv/data",
};

describe("PupuLoginController", () => {
  it("starts captcha without exposing or persisting the phone", async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      status: "failed",
      error: { code: "captcha_required" },
      data: { challenge: { challenge_url: "http://127.0.0.1:3210/challenge/abcdefghijklmnopqrstuvwxyz123456" } },
    });
    const controller = new PupuLoginController({ execute, attemptTtlMs: 60_000, resendCooldownMs: 30_000 });
    const result = await controller.start("session-a", scope, "13000000000");

    expect(result.phase).toBe("captcha");
    expect(result).toHaveProperty("attemptId");
    expect(JSON.stringify(result)).not.toContain("13000000000");
    expect(controller.inspectAttempt("session-a")).not.toHaveProperty("phone");
    controller.cancel("session-a");
    expect(controller.captchaBridge.inspect("session-a", result.attemptId!)).toBeNull();

  });

  it("applies a completed captcha and repeats the real SMS request", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: "captcha_required",
        error: { code: "captcha_required" },
        data: {
          login_session_id: "11111111-2222-4333-8444-555555555555",
          challenge: { challenge_url: "http://127.0.0.1:3210/challenge/abcdefghijklmnopqrstuvwxyz123456" },
        },
      })
      .mockResolvedValueOnce({ ok: true, status: "captcha_applied" })
      .mockResolvedValueOnce({ ok: true, status: "sms_requested" });
    const bridge = new CaptchaBridge({ fetch: vi.fn() });
    const controller = new PupuLoginController({
      execute, captchaBridge: bridge, attemptTtlMs: 60_000, resendCooldownMs: 30_000,
    });
    const started = await controller.start("session-a", scope, "13000000000");
    expect(bridge.inspect("session-a", started.attemptId!)).toEqual({ registered: true });
    const result = await controller.completeCaptcha("session-a");
    expect(result.phase).toBe("sms");
    expect(execute.mock.calls[1][1]).toEqual({
      kind: "applyCaptcha",
      loginSessionId: "11111111-2222-4333-8444-555555555555",
    });
    expect(execute.mock.calls[2][1]).toEqual({
      kind: "request", phone: "13000000000",
      loginSessionId: "11111111-2222-4333-8444-555555555555",
    });
  });

  it("sends OTP via stdin and requires a fresh ready status", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: "sms_requested" })
      .mockResolvedValueOnce({ ok: true, status: "succeeded", data: { login_saved: true } })
      .mockResolvedValueOnce({
        ok: true, status: "ready",
        data: { auth_present: true, auth_saved: true, last_verify_code_errcode: 0 },
      });
    const controller = new PupuLoginController({ execute, attemptTtlMs: 60_000, resendCooldownMs: 30_000 });
    await controller.start("session-a", scope, "13000000000");
    const result = await controller.verify("session-a", "654321");

    expect(result.phase).toBe("connected");
    expect(execute.mock.calls[1][1]).toEqual({ kind: "verify", code: "654321" });
    expect(execute.mock.calls[2][1]).toEqual({ kind: "status" });
    expect(JSON.stringify(result)).not.toContain("654321");
  });
  it("enforces resend cooldown before invoking the CLI", async () => {
    let now = 1000;
    const execute = vi.fn().mockResolvedValue({ ok: true, status: "sms_requested" });
    const controller = new PupuLoginController({
      execute,
      now: () => now,
      attemptTtlMs: 60_000,
      resendCooldownMs: 30_000,
    });
    await controller.start("session-a", scope, "13000000000");

    const throttled = await controller.resend("session-a");
    expect(throttled.phase).toBe("sms");
    expect(throttled.retryAfterSeconds).toBe(30);
    expect(execute).toHaveBeenCalledTimes(1);

    now = 31_001;
    const sent = await controller.resend("session-a");
    expect(sent.phase).toBe("sms");
    expect(execute).toHaveBeenCalledTimes(2);
  });


  it("isolates attempts and cancels only the current session", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, status: "sms_requested" });
    const controller = new PupuLoginController({ execute, attemptTtlMs: 60_000, resendCooldownMs: 30_000 });
    await controller.start("session-a", scope, "13000000000");
    await controller.start("session-b", { ...scope, accountId: "acct_abcdefabcdefabcdefabcdefabcdefab" }, "13100000000");

    expect(controller.cancel("session-a").phase).toBe("auth_required");
    expect(controller.inspectAttempt("session-a")).toBeNull();
    expect(controller.inspectAttempt("session-b")).not.toBeNull();
  });
});
