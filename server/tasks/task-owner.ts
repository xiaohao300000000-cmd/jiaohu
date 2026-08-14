import { randomBytes } from "node:crypto";

export interface TaskOwner {
  ownerId: string;
  setCookie?: string;
}

const COOKIE_NAME = "pupu_task_owner";
const OWNER_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return undefined;
}

export function resolveTaskOwner(
  request: Request,
  createToken: () => string = () => randomBytes(32).toString("base64url"),
): TaskOwner {
  const existing = readCookie(request.headers.get("cookie"));
  if (existing && OWNER_PATTERN.test(existing)) {
    return { ownerId: existing };
  }

  const ownerId = createToken();
  if (!OWNER_PATTERN.test(ownerId)) {
    throw new Error("task owner token must be 32-byte base64url");
  }
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    ownerId,
    setCookie:
      `${COOKIE_NAME}=${ownerId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`,
  };
}
