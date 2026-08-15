import { isAbsolute } from "node:path";

export interface HermesClientConfig {
  baseUrl: string;
  apiKey?: string;
}
export interface HermesServerConfig extends HermesClientConfig {
  ownerSessionKey: string;
}

export interface PupuLoginConfig {
  cliPath: string;
  dataRoot: string;
  accountsRoot: string;
  runtimeRoot: string;
  publicOrigin: string;
  attemptTtlMs: number;
  resendCooldownMs: number;
}

function absolutePath(value: string, name: string): string {
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

function seconds(
  raw: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value * 1000;
}

export function getPupuLoginConfig(
  env: NodeJS.ProcessEnv = process.env,
): PupuLoginConfig {
  const publicOrigin = new URL(
    env.APP_PUBLIC_ORIGIN || "http://127.0.0.1:4173",
  ).origin;
  return {
    cliPath: absolutePath(
      env.PUPU_CLI_PATH || "/home/pupu/providers/pupu-cli/.venv/bin/pupu",
      "PUPU_CLI_PATH",
    ),
    dataRoot: absolutePath(
      env.PUPU_DATA_DIR || "/home/pupu/providers/pupu-cli/.local/private",
      "PUPU_DATA_DIR",
    ),
    accountsRoot: absolutePath(
      env.PUPU_ACCOUNTS_ROOT || "/home/pupu/.local/share/jiaohu/pupu-accounts",
      "PUPU_ACCOUNTS_ROOT",
    ),
    runtimeRoot: absolutePath(
      env.PUPU_LOGIN_RUNTIME_ROOT || "/home/pupu/.local/state/jiaohu/pupu-login",
      "PUPU_LOGIN_RUNTIME_ROOT",
    ),
    publicOrigin,
    attemptTtlMs: seconds(
      env.PUPU_LOGIN_ATTEMPT_TTL_SECONDS,
      600,
      "PUPU login TTL",
      60,
      1800,
    ),
    resendCooldownMs: seconds(
      env.PUPU_LOGIN_RESEND_COOLDOWN_SECONDS,
      60,
      "PUPU login resend cooldown",
      30,
      300,
    ),
  };
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function getHermesConfig(
  env: NodeJS.ProcessEnv = process.env,
): HermesServerConfig {
  const baseUrl = env.HERMES_BASE_URL || "http://127.0.0.1:8642";
  const parsed = new URL(baseUrl);
  const ownerId = env.PUPU_OWNER_ID || "household-f3f3b74a55ae8bf60b6c1172";
  if (!isLoopback(parsed.hostname) && env.ALLOW_REMOTE_HERMES !== "true") {
    throw new Error("HERMES_BASE_URL must use a loopback address");
  }
  return {
    baseUrl: parsed.toString().replace(/\/$/, ""),
    apiKey: env.HERMES_API_KEY || undefined,
    ownerSessionKey: `owner-${ownerId}`,
  };
}
