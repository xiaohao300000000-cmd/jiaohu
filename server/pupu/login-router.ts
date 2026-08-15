import type { PupuLoginState, PupuCliScope } from "./login-types";
import type { PupuSessionStore } from "./session-store";
import {
  assertMutationRequest,
  clearLoginCookie,
  loginCookie,
  noStoreHeaders,
  readPupuSessionCookie,
} from "./http-security";

interface Controller {
  status(scope: PupuCliScope, signal?: AbortSignal): Promise<PupuLoginState>;
  start(sessionId: string, scope: PupuCliScope, phone: string, signal?: AbortSignal): Promise<PupuLoginState>;
  completeCaptcha(sessionId: string, signal?: AbortSignal): Promise<PupuLoginState>;
  verify(sessionId: string, code: string, signal?: AbortSignal): Promise<PupuLoginState>;
  resend(sessionId: string, signal?: AbortSignal): Promise<PupuLoginState>;
  cancel(sessionId: string): PupuLoginState;
  captchaBridge: {
    forward(
      sessionId: string, attemptId: string, method: "GET" | "POST",
      suffix: string, body?: Uint8Array, signal?: AbortSignal,
    ): Promise<Response>;
  };
}

interface LoginRouterDependencies {
  sessionStore: PupuSessionStore;
  controller: Controller;
  config: {
    cliPath: string;
    dataRoot: string;
    accountsRoot: string;
    householdId: string;
    publicOrigin: string;
  };
}

function json(value: unknown, status = 200, extra?: Record<string, string>): Response {
  return Response.json(value, {
    status,
    headers: { ...noStoreHeaders(), ...extra },
  });
}

function safeError(status: number, code: string, message: string): Response {
  return json({ phase: "error", error: { code, message, retryable: status >= 500 } }, status);
}

async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON object required");
  }
  return value as Record<string, unknown>;
}

export async function handlePupuLoginRequest(
  request: Request,
  dependencies: LoginRouterDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const candidate = readPupuSessionCookie(request.headers.get("cookie"));
  const session = await dependencies.sessionStore.resolve(candidate);
  const extra = session.created
    ? { "set-cookie": loginCookie(session.token, dependencies.config.publicOrigin.startsWith("https:")) }
    : undefined;
  const scope: PupuCliScope = {
    cliPath: dependencies.config.cliPath,
    householdId: dependencies.config.householdId,
    dataRoot: dependencies.config.dataRoot,
  };


  try {
    if (request.method === "GET" && url.pathname === "/api/pupu/login/status") {
      return json(await dependencies.controller.status(scope, request.signal), 200, extra);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/pupu/login/captcha/complete"
    ) {
      assertMutationRequest(request, dependencies.config.publicOrigin);
      return json(await dependencies.controller.completeCaptcha(session.accountId, request.signal), 200, extra);
    }

    const captcha = url.pathname.match(
      /^\/api\/pupu\/login\/captcha\/([A-Za-z0-9-]{1,64})(?:\/(result))?\/?$/,
    );
    if (captcha && (request.method === "GET" || request.method === "POST")) {
      if (request.method === "POST") {
        assertMutationRequest(request, dependencies.config.publicOrigin);
      }
      const body = request.method === "POST"
        ? new Uint8Array(await request.arrayBuffer())
        : undefined;
      const response = await dependencies.controller.captchaBridge.forward(
        session.accountId,
        captcha[1],
        request.method,
        captcha[2] === "result" ? "/result" : "",
        body,
        request.signal,
      );
      if (extra) response.headers.set("set-cookie", extra["set-cookie"]);
      return response;
    }

    assertMutationRequest(request, dependencies.config.publicOrigin);
    if (request.method === "POST" && url.pathname === "/api/pupu/login/start") {
      const body = await bodyObject(request);
      if (typeof body.phone !== "string") return safeError(400, "invalid_phone", "Enter a valid phone number.");
      return json(
        await dependencies.controller.start(session.accountId, scope, body.phone, request.signal),
        200,
        extra,
      );
    }
    if (request.method === "POST" && url.pathname === "/api/pupu/login/verify") {
      const body = await bodyObject(request);
      if (typeof body.code !== "string") return safeError(400, "invalid_code", "Enter the SMS code.");
      return json(await dependencies.controller.verify(session.accountId, body.code, request.signal), 200, extra);
    }
    if (request.method === "POST" && url.pathname === "/api/pupu/login/resend") {
      return json(await dependencies.controller.resend(session.accountId, request.signal), 200, extra);
    }
    if (request.method === "POST" && url.pathname === "/api/pupu/login/cancel") {
      return json(dependencies.controller.cancel(session.accountId), 200, extra);
    }
    if (request.method === "DELETE" && url.pathname === "/api/pupu/login/session") {
      const state = dependencies.controller.cancel(session.accountId);
      await dependencies.sessionStore.remove(session);
      return json(state, 200, {
        "set-cookie": clearLoginCookie(
          dependencies.config.publicOrigin.startsWith("https:"),
        ),
      });
    }
    return safeError(404, "not_found", "Login route not found.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/origin|JSON/.test(message)) {
      return safeError(403, "request_rejected", "Login request was rejected.");
    }
    if (/invalid|object|required/.test(message)) {
      return safeError(400, "invalid_request", "Login request is invalid.");
    }
    return safeError(502, "login_unavailable", "Pupu login is temporarily unavailable.");
  }
}
