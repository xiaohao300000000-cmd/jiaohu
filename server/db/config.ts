export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  idleTimeoutMs: number;
}

const DEFAULT_URL =
  "postgresql:///jiaohu_task_state?host=/var/run/postgresql";

function isLocalDatabase(url: URL): boolean {
  const socket = url.searchParams.get("host");
  return (
    socket === "/var/run/postgresql" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}

export function getDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const value = env.DATABASE_URL;
  if (!value && env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required");
  }
  const url = value || DEFAULT_URL;
  const parsed = new URL(url);
  if (parsed.protocol !== "postgresql:" || !isLocalDatabase(parsed)) {
    throw new Error("DATABASE_URL must use localhost or a Unix socket");
  }
  const maxConnections = Number(env.DATABASE_POOL_MAX || 4);
  if (
    !Number.isInteger(maxConnections) ||
    maxConnections < 1 ||
    maxConnections > 10
  ) {
    throw new Error(
      "DATABASE_POOL_MAX must be an integer from 1 to 10",
    );
  }
  return {
    url,
    maxConnections,
    idleTimeoutMs: 30_000,
  };
}
