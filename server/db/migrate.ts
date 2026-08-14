import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { withTransaction } from "./transaction";

const MIGRATION_LOCK = 74_201_984;

export async function migrate(
  pool: Pool,
  migrationsRoot: string,
): Promise<void> {
  const files = (await readdir(migrationsRoot))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  await withTransaction(pool, async (client) => {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    await client.query("SELECT pg_advisory_xact_lock($1)", [
      MIGRATION_LOCK,
    ]);
    for (const version of files) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (applied.rowCount) continue;
      await client.query(await readFile(join(migrationsRoot, version), "utf8"));
      await client.query(
        "INSERT INTO schema_migrations(version) VALUES ($1)",
        [version],
      );
    }
  });
}
