import type { PupuLoginPresentation } from "../components/journey/types";

export type PupuLoginResponse =
  | { phase: "auth_required" }
  | PupuLoginPresentation;

const VALID_PHASES = new Set([
  "auth_required", "phone", "requesting", "captcha", "applying_captcha",
  "sms", "verifying", "connected", "error",
]);

function validate(value: unknown): PupuLoginResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid login response");
  }
  const response = value as Record<string, unknown>;
  if (typeof response.phase !== "string" || !VALID_PHASES.has(response.phase)) {
    throw new Error("invalid login response");
  }
  if ("phone" in response || "code" in response || "token" in response) {
    throw new Error("invalid login response");
  }
  return response as PupuLoginResponse;
}

async function request(
  fetcher: typeof fetch,
  path: string,
  method = "GET",
  body?: Record<string, string>,
): Promise<PupuLoginResponse> {
  const response = await fetcher(path, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? undefined : { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : method === "GET" ? undefined : "{}",
  });
  if (!response.ok) throw new Error("Pupu login request failed");
  return validate(await response.json());
}

export function createPupuLoginClient(fetcher: typeof fetch = fetch) {
  return {
    status: () => request(fetcher, "/api/pupu/login/status"),
    start: (phone: string) =>
      request(fetcher, "/api/pupu/login/start", "POST", { phone }),
    completeCaptcha: () =>
      request(fetcher, "/api/pupu/login/captcha/complete", "POST"),
    verify: (code: string) =>
      request(fetcher, "/api/pupu/login/verify", "POST", { code }),
    resend: () =>
      request(fetcher, "/api/pupu/login/resend", "POST"),
  };
}

