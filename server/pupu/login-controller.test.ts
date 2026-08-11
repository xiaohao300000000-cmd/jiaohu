import { describe, expect, it, vi } from "vitest";
import { PupuLoginController } from "./login-controller";

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
      data: { challenge_url: "http://127.0.0.1:3210/challenge/token" },
    });
    const controller = new PupuLoginController({ execute, attemptTtlMs: 60_000, resendCooldownMs: 30_000 });
    const result = await controller.start("session-a", scope, "13000000000");

    expect(result.phase).toBe("captcha");
    expect(result).toHaveProperty("attemptId");
    expect(JSON.stringify(result)).not.toContain("13000000000");
    expect(controller.inspectAttempt("session-a")).not.toHaveProperty("phone");
  });

  it("sends OTP via stdin and requires a fresh ready status", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: "sms_requested" })
      .mockResolvedValueOnce({ ok: true, status: "succeeded", data: { login_saved: true } })
      .mockResolvedValueOnce({
        ok: true, status: "succeeded",
        data: { status: "ready", auth_present: true, auth_saved: true, last_verify_code_errcode: 0 },
      });
    const controller = new PupuLoginController({ execute, attemptTtlMs: 60_000, resendCooldownMs: 30_000 });
    await controller.start("session-a", scope, "13000000000");
    const result = await controller.verify("session-a", "654321");

    expect(result.phase).toBe("connected");
    expect(execute.mock.calls[1][1]).toEqual({ kind: "verify", code: "654321" });
    expect(execute.mock.calls[2][1]).toEqual({ kind: "status" });
    expect(JSON.stringify(result)).not.toContain("654321");
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

