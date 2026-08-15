export type PupuLoginPhase =
  | "auth_required" | "phone" | "requesting" | "captcha"
  | "applying_captcha" | "sms" | "verifying" | "connected" | "error";

export interface PupuLoginState {
  phase: PupuLoginPhase;
  attemptId?: string;
  captchaUrl?: string;
  expiresAt?: string;
  retryAfterSeconds?: number;
  error?: { code: string; message: string; retryable: boolean };
}

export interface PupuCliScope {
  cliPath: string;
  accountId: string;
  accountsRoot: string;
  dataRoot: string;
}

export type LoginOperation =
  | { kind: "status" }
  | { kind: "request"; phone: string; loginSessionId?: string }
  | { kind: "applyCaptcha"; loginSessionId: string }
  | { kind: "verify"; code: string; loginSessionId?: string };
