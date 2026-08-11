interface CaptchaBridgeOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

interface Binding {
  sessionId: string;
  challengeUrl: string;
  expiresAt: number;
}

function validateChallenge(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !/^\/challenge\/[A-Za-z0-9_-]{20,}$/.test(url.pathname)
  ) {
    throw new Error("captcha helper must be a loopback challenge");
  }
  if (url.search || url.hash) throw new Error("captcha helper route is unsafe");
  return url;
}

export class CaptchaBridge {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly bindings = new Map<string, Binding>();

  constructor(options: CaptchaBridgeOptions = {}) {
    this.fetcher = options.fetch || fetch;
    this.now = options.now || Date.now;
  }

  register(
    sessionId: string,
    attemptId: string,
    challengeUrl: string,
    expiresAt: number,
  ): void {
    const validated = validateChallenge(challengeUrl);
    this.bindings.set(attemptId, {
      sessionId,
      challengeUrl: validated.toString(),
      expiresAt,
    });
  }

  inspect(sessionId: string, attemptId: string): { registered: true } | null {
    const binding = this.bindings.get(attemptId);
    return binding?.sessionId === sessionId ? { registered: true } : null;
  }

  remove(sessionId: string, attemptId: string): void {
    const binding = this.bindings.get(attemptId);
    if (binding?.sessionId === sessionId) this.bindings.delete(attemptId);
  }

  async forward(
    sessionId: string,
    attemptId: string,
    method: "GET" | "POST",
    suffix: "" | "/result" | string,
    body?: Uint8Array,
    signal?: AbortSignal,
  ): Promise<Response> {
    const binding = this.bindings.get(attemptId);
    if (!binding || binding.sessionId !== sessionId) throw new Error("captcha challenge not found");
    if (binding.expiresAt <= this.now()) {
      this.bindings.delete(attemptId);
      throw new Error("captcha challenge expired");
    }
    if (!((method === "GET" && suffix === "") || (method === "POST" && suffix === "/result"))) {
      throw new Error("captcha route is not allowed");
    }
    if (body && body.byteLength > 64 * 1024) throw new Error("captcha result is too large");

    const target = `${binding.challengeUrl.replace(/\/$/, "")}${suffix}`;
    const upstream = await this.fetcher(target, {
      method,
      body: method === "POST" ? body : undefined,
      headers: method === "POST" ? { "content-type": "application/json" } : undefined,
      signal,
    });
    const headers = new Headers({
      "cache-control": "no-store, private",
      pragma: "no-cache",
      "content-security-policy":
        "default-src 'self' https://static.geetest.com; script-src 'self' 'unsafe-inline' https://static.geetest.com; connect-src 'self' https:; frame-ancestors 'self'",
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const responseBody = upstream.status === 204 ? null : await upstream.arrayBuffer();
    if (method === "POST" && upstream.ok) this.bindings.delete(attemptId);
    return new Response(responseBody, { status: upstream.status, headers });
  }
}

