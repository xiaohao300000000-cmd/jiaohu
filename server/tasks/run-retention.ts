import { getDatabaseConfig } from "../db/config";
import { createDatabasePool } from "../db/pool";
import { runTaskRetention } from "./task-retention";

const pool = createDatabasePool(getDatabaseConfig());
try {
  await pool.query("SELECT 1");
  const result = await runTaskRetention(pool);
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
