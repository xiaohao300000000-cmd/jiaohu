export interface HermesClientConfig {
  baseUrl: string;
  apiKey?: string;
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
): HermesClientConfig {
  const baseUrl = env.HERMES_BASE_URL || "http://127.0.0.1:8642";
  const parsed = new URL(baseUrl);
  if (!isLoopback(parsed.hostname) && env.ALLOW_REMOTE_HERMES !== "true") {
    throw new Error("HERMES_BASE_URL must use a loopback address");
  }
  return {
    baseUrl: parsed.toString().replace(/\/$/, ""),
    apiKey: env.HERMES_API_KEY || undefined,
  };
}
