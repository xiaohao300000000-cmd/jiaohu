import { randomUUID } from "node:crypto";
import { executeLoginCommand } from "./cli-runner";
import type {
  LoginOperation, PupuCliScope, PupuLoginState,
} from "./login-types";

type Execute = (
  scope: PupuCliScope,
  operation: LoginOperation,
  signal?: AbortSignal,
) => Promise<Record<string, unknown>>;

interface Options {
  execute?: Execute;
  attemptTtlMs: number;
  resendCooldownMs: number;
  now?: () => number;
}

interface Attempt {
  id: string;
  scope: PupuCliScope;
  phone: string;
  expiresAt: number;
  resendAt: number;
  phase: "captcha" | "sms";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function providerCode(result: Record<string, unknown>): string {
  return String(object(result.error).code || result.status || "");
}

function isSmsRequested(result: Record<string, unknown>): boolean {
  return result.status === "sms_requested" ||
    object(result.data).status === "sms_requested" ||
    object(result.data).sms_requested === true;
}

function isReady(result: Record<string, unknown>): boolean {
  const data = object(result.data);
  return data.status === "ready" &&
    data.auth_present === true &&
    data.auth_saved === true &&
    data.last_verify_code_errcode === 0;
}

export class PupuLoginController {
  private readonly execute: Execute;
  private readonly now: () => number;
  private readonly attempts = new Map<string, Attempt>();

  constructor(private readonly options: Options) {
    this.execute = options.execute || executeLoginCommand;
    this.now = options.now || Date.now;
  }

  inspectAttempt(sessionId: string): Omit<Attempt, "phone" | "scope"> | null {
    const attempt = this.current(sessionId);
    if (!attempt) return null;
    const { id, expiresAt, resendAt, phase } = attempt;
    return { id, expiresAt, resendAt, phase };
  }

  private current(sessionId: string): Attempt | null {
    const attempt = this.attempts.get(sessionId);
    if (!attempt) return null;
    if (attempt.expiresAt <= this.now()) {
      this.attempts.delete(sessionId);
      return null;
    }
    return attempt;
  }

  async status(scope: PupuCliScope, signal?: AbortSignal): Promise<PupuLoginState> {
    const result = await this.execute(scope, { kind: "status" }, signal);
    return isReady(result) ? { phase: "connected" } : { phase: "auth_required" };
  }

  async start(
    sessionId: string,
    scope: PupuCliScope,
    phone: string,
    signal?: AbortSignal,
  ): Promise<PupuLoginState> {
    const result = await this.execute(scope, { kind: "request", phone }, signal);
    const now = this.now();
    const attempt: Attempt = {
      id: randomUUID(),
      scope,
      phone,
      expiresAt: now + this.options.attemptTtlMs,
      resendAt: now + this.options.resendCooldownMs,
      phase: "sms",
    };
    if (providerCode(result) === "captcha_required") attempt.phase = "captcha";
    else if (!isSmsRequested(result)) {
      return {
        phase: "error",
        error: { code: "provider_error", message: "Pupu login is temporarily unavailable.", retryable: true },
      };
    }
    this.attempts.set(sessionId, attempt);
    return {
      phase: attempt.phase,
      attemptId: attempt.id,
      ...(attempt.phase === "captcha"
        ? { captchaUrl: `/api/pupu/login/captcha/${attempt.id}/` }
        : { retryAfterSeconds: Math.ceil(this.options.resendCooldownMs / 1000) }),
      expiresAt: new Date(attempt.expiresAt).toISOString(),
    };
  }

  async verify(
    sessionId: string,
    code: string,
    signal?: AbortSignal,
  ): Promise<PupuLoginState> {
    const attempt = this.current(sessionId);
    if (!attempt || attempt.phase !== "sms") return { phase: "auth_required" };
    const result = await this.execute(attempt.scope, { kind: "verify", code }, signal);
    if (result.ok !== true) {
      return {
        phase: "sms",
        attemptId: attempt.id,
        error: { code: "invalid_code", message: "The verification code was not accepted.", retryable: true },
      };
    }
    const status = await this.execute(attempt.scope, { kind: "status" }, signal);
    if (!isReady(status)) {
      return {
        phase: "error",
        error: { code: "auth_not_saved", message: "Pupu authentication was not saved.", retryable: true },
      };
    }
    this.attempts.delete(sessionId);
    return { phase: "connected" };
  }

  cancel(sessionId: string): PupuLoginState {
    this.attempts.delete(sessionId);
    return { phase: "auth_required" };
  }
}

