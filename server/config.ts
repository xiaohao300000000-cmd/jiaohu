export interface HermesClientConfig {
  baseUrl: string;
  apiKey?: string;
}
export interface HermesServerConfig extends HermesClientConfig {
  ownerSessionKey: string;
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
