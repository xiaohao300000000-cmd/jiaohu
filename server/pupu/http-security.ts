const SESSION_COOKIE = "pupu_session";

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const key = segment.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(segment.slice(separator + 1).trim());
  }
  return undefined;
}

export function readPupuSessionCookie(header: string | null): string | undefined {
  return readCookie(header, SESSION_COOKIE);
}

export function loginCookie(token: string, secure: boolean): string {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearLoginCookie(secure: boolean): string {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function assertMutationRequest(request: Request, publicOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin !== new URL(publicOrigin).origin) {
    throw new Error("request origin is not allowed");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    throw new Error("request must use JSON");
  }
}

export function noStoreHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store, private",
    pragma: "no-cache",
  };
}

