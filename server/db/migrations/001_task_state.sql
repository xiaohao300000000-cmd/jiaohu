CREATE TABLE tasks (
  task_id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  provider_account_id text,
  version bigint NOT NULL CHECK (version > 0),
  domain text NOT NULL,
  goal text NOT NULL,
  phase text NOT NULL,
  request_text text NOT NULL,
  people_count integer CHECK (people_count BETWEEN 1 AND 100),
  budget_cents integer CHECK (budget_cents >= 0),
  dietary_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  terminal_at timestamptz
);

CREATE INDEX tasks_owner_updated_idx
  ON tasks(owner_id, updated_at DESC);

CREATE TABLE task_address_bindings (
  task_id uuid PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  receiver_id text NOT NULL,
  store_id text NOT NULL,
  place_id text NOT NULL,
  place_zip integer,
  binding_version bigint NOT NULL CHECK (binding_version > 0),
  bound_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_runs (
  run_id text PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  task_version bigint NOT NULL,
  owner_id text NOT NULL,
  allowed_capabilities jsonb NOT NULL,
  status text NOT NULL
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX task_runs_task_created_idx
  ON task_runs(task_id, created_at DESC);

CREATE TABLE task_product_candidates (
  candidate_id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  task_version bigint NOT NULL,
  run_id text NOT NULL REFERENCES task_runs(run_id),
  tool_call_id text NOT NULL,
  store_product_id text NOT NULL,
  provider_product_id text,
  name text NOT NULL,
  specification text,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  in_stock boolean NOT NULL,
  evidence_ref text,
  collected_at timestamptz NOT NULL,
  UNIQUE(task_id, run_id, store_product_id)
);

CREATE TABLE final_plans (
  plan_id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  plan_version bigint NOT NULL CHECK (plan_version > 0),
  task_version bigint NOT NULL,
  run_id text NOT NULL REFERENCES task_runs(run_id),
  title text NOT NULL,
  explanation text NOT NULL,
  currency text NOT NULL CHECK (currency = 'CNY'),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  status text NOT NULL
    CHECK (status IN ('current', 'superseded', 'invalidated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, plan_version)
);

CREATE UNIQUE INDEX final_plans_one_current_idx
  ON final_plans(task_id)
  WHERE status = 'current';

CREATE TABLE final_plan_items (
  plan_id uuid NOT NULL REFERENCES final_plans(plan_id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES task_product_candidates(candidate_id),
  position integer NOT NULL CHECK (position >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0),
  PRIMARY KEY(plan_id, candidate_id),
  UNIQUE(plan_id, position)
);

CREATE TABLE task_confirmations (
  confirmation_id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cart', 'checkout')),
  task_version bigint NOT NULL,
  plan_id uuid NOT NULL REFERENCES final_plans(plan_id),
  plan_version bigint NOT NULL,
  binding_version bigint NOT NULL,
  payload_hash text NOT NULL,
  provider_payload jsonb NOT NULL,
  status text NOT NULL
    CHECK (status IN ('active', 'consumed', 'expired', 'invalidated')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_confirmations_active_idx
  ON task_confirmations(task_id, kind, expires_at)
  WHERE status = 'active';

CREATE TABLE idempotency_records (
  account_id text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  task_id uuid NOT NULL REFERENCES tasks(task_id),
  status text NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed')),
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(account_id, operation, idempotency_key)
);
