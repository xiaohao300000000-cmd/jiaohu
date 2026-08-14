#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT 1;
SELECT version FROM schema_migrations ORDER BY version;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'tasks',
    'task_address_bindings',
    'task_runs',
    'task_product_candidates',
    'final_plans',
    'final_plan_items',
    'task_confirmations',
    'idempotency_records'
  )
ORDER BY table_name;
SELECT CASE WHEN COUNT(*) = 0 THEN 'final_plan_invariant_ok'
            ELSE 'final_plan_invariant_failed' END
FROM (
  SELECT task_id
  FROM final_plans
  WHERE status = 'current'
  GROUP BY task_id
  HAVING COUNT(*) > 1
) conflicts;
SQL
