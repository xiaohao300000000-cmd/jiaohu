import { describe, expect, it } from "vitest";
import { getDatabaseConfig } from "./config";

describe("getDatabaseConfig", () => {
  it("uses the local Unix socket with bounded defaults", () => {
    expect(getDatabaseConfig({
      DATABASE_URL:
        "postgresql:///jiaohu_task_state?host=/var/run/postgresql",
    } as NodeJS.ProcessEnv)).toEqual({
      url: "postgresql:///jiaohu_task_state?host=/var/run/postgresql",
      maxConnections: 4,
      idleTimeoutMs: 30_000,
    });
  });

  it("requires an explicit production database", () => {
    expect(() => getDatabaseConfig({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv)).toThrow("DATABASE_URL is required");
  });

  it("rejects remote databases and invalid pool sizes", () => {
    expect(() => getDatabaseConfig({
      DATABASE_URL: "postgresql://db.example.com/jiaohu",
    } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_URL must use localhost or a Unix socket",
    );
    expect(() => getDatabaseConfig({
      DATABASE_URL:
        "postgresql:///jiaohu_task_state?host=/var/run/postgresql",
      DATABASE_POOL_MAX: "11",
    } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_POOL_MAX must be an integer from 1 to 10",
    );
  });
});
