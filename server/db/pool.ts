import { Pool } from "pg";
import type { DatabaseConfig } from "./config";

export function createDatabasePool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.url,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMs,
    allowExitOnIdle: process.env.NODE_ENV === "test",
  });
}
