# PostgreSQL Task State and Structured FinalPlan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every task-owned business fact in PostgreSQL and make a validated structured FinalPlan the only source for UI, cart, and checkout product state.

**Architecture:** PostgreSQL repositories assemble TaskSnapshot and enforce optimistic concurrency inside transactions. TaskCoordinator becomes a pure rules module; TaskApplicationService orchestrates persistence and provider boundaries. Hermes receives the complete safe TaskSnapshot, persists live candidates, and must call `submit_final_plan`; GenUI and mutation routes consume only the resulting TaskSnapshot.

**Tech Stack:** TypeScript 5.8, Node.js 22, Express 5, PostgreSQL 14 on Ubuntu 22.04, `pg`, Zod 4, Vitest 3, Python 3.12/Pydantic, Playwright.

## Global Constraints

- All project writes and verification run on `pupu-vps` in `/home/pupu/.worktrees/jiaohu-task-route-center`.
- Use branch `codex/task-state-postgres`; do not write project files to the Mac workspace.
- Set `PATH=/home/pupu/.nvm/versions/node/v22.23.2/bin:$PATH` for Node commands.
- Run Vitest with `--maxWorkers=1` because the VPS has 4 GB RAM and no swap.
- PostgreSQL is mandatory for business state; never fall back to process memory.
- TaskCoordinator owns rules only and must not import `pg`, repositories, filesystems, controllers, or network clients.
- `run.completed.summary` is display copy only and must never select products.
- Automated tests must use fake providers; never write a real cart, create a real order, or initiate payment.
- Preserve the external Pupu CLI as the provider boundary.
- Every state-changing database statement is owner-scoped and version-checked.
- Do not deploy or restart production services until the complete suite passes and the user explicitly approves deployment.

## File and Responsibility Map

- `server/db/config.ts`: validate PostgreSQL URLs and pool limits.
- `server/db/pool.ts`: create and close the shared `pg.Pool`.
- `server/db/migrate.ts`: apply ordered SQL migrations under an advisory lock.
- `server/db/transaction.ts`: transaction helper with rollback.
- `server/db/migrations/001_task_state.sql`: authoritative schema and indexes.
- `server/tasks/task-coordinator.ts`: pure routing, policy, and transition decisions.
- `server/tasks/task-repository.ts`: PostgreSQL persistence and TaskSnapshot projection.
- `server/tasks/task-application-service.ts`: task transaction orchestration.
- `server/tasks/task-owner.ts`: stable opaque owner cookie.
- `server/tasks/task-router.ts`: account-scoped `GET /api/tasks/:taskId`.
- `server/tasks/final-plan.ts`: structured FinalPlan schema and validation command.
- `server/tasks/idempotency-repository.ts`: durable mutation acquisition and replay.
- `hermes/plugins/pupu_readonly/final_plan.py`: safe `submit_final_plan` artifact.
- `src/components/pupu/PupuPurchaseCard.tsx`: render the final plan from TaskSnapshot only.
- `src/ai/useLiveJourney.ts`: restore and replace authoritative task snapshots.
- Existing Pupu controllers become stateless provider adapters after their maps are removed.

---

### Task 1: PostgreSQL Runtime, Configuration, and Migration Runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/config.ts`
- Create: `server/db/config.ts`
- Create: `server/db/pool.ts`
- Create: `server/db/transaction.ts`
- Create: `server/db/migrate.ts`
- Create: `server/db/migrations/001_task_state.sql`
- Create: `server/db/config.test.ts`
- Create: `server/db/migrate.test.ts`

**Interfaces:**
- Produces: `DatabaseConfig { url: string; maxConnections: number; idleTimeoutMs: number }`
- Produces: `createDatabasePool(config): Pool`
- Produces: `withTransaction(pool, callback): Promise<T>`
- Produces: `migrate(pool, migrationsRoot): Promise<void>`

- [ ] **Step 1: Install PostgreSQL locally on the VPS and create isolated application and test databases**

Run:

```bash
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client
sudo systemctl enable --now postgresql
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pupu') THEN
    CREATE ROLE pupu LOGIN;
  END IF;
END
$$;
SELECT 'CREATE DATABASE jiaohu_task_state OWNER pupu'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jiaohu_task_state')\gexec
SELECT 'CREATE DATABASE jiaohu_task_state_test OWNER pupu'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jiaohu_task_state_test')\gexec
SQL
pg_isready -h /var/run/postgresql
```

Expected: PostgreSQL reports `accepting connections`. Use Unix-socket peer authentication; do not create or print a database password.

- [ ] **Step 2: Write failing configuration tests**

Add tests that require local-only PostgreSQL URLs, reject missing production configuration, and bound the pool to 1-10 connections:

```ts
expect(getDatabaseConfig({
  DATABASE_URL: "postgresql:///jiaohu_task_state?host=/var/run/postgresql",
})).toEqual({
  url: "postgresql:///jiaohu_task_state?host=/var/run/postgresql",
  maxConnections: 4,
  idleTimeoutMs: 30_000,
});
expect(() => getDatabaseConfig({ NODE_ENV: "production" })).toThrow(
  "DATABASE_URL is required",
);
expect(() => getDatabaseConfig({
  DATABASE_URL: "postgresql://db.example.com/jiaohu",
})).toThrow("DATABASE_URL must use localhost or a Unix socket");
```

- [ ] **Step 3: Run the configuration test to verify RED**

Run:

```bash
export PATH=/home/pupu/.nvm/versions/node/v22.23.2/bin:$PATH
npx vitest run server/db/config.test.ts --maxWorkers=1
```

Expected: FAIL because `server/db/config.ts` does not exist.

- [ ] **Step 4: Add `pg`, configuration, pool, transaction, and migration APIs**

Run `npm install pg && npm install -D @types/pg`. Implement:

```ts
export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  idleTimeoutMs: number;
}

export function getDatabaseConfig(env = process.env): DatabaseConfig {
  const value = env.DATABASE_URL;
  if (!value) {
    if (env.NODE_ENV === "production") throw new Error("DATABASE_URL is required");
    return {
      url: "postgresql:///jiaohu_task_state?host=/var/run/postgresql",
      maxConnections: 4,
      idleTimeoutMs: 30_000,
    };
  }
  const parsed = new URL(value);
  const socket = parsed.searchParams.get("host");
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) &&
      socket !== "/var/run/postgresql") {
    throw new Error("DATABASE_URL must use localhost or a Unix socket");
  }
  const maxConnections = Number(env.DATABASE_POOL_MAX || 4);
  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 10) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 10");
  }
  return { url: value, maxConnections, idleTimeoutMs: 30_000 };
}
```

```ts
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
```

The migration runner must create `schema_migrations(version text primary key, applied_at timestamptz)`, acquire `pg_advisory_xact_lock(74201984)`, and apply each unapplied `*.sql` file plus its version row in one transaction.

- [ ] **Step 5: Create the complete initial SQL migration**

The migration must create these tables and constraints exactly:

```sql
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
CREATE INDEX tasks_owner_updated_idx ON tasks(owner_id, updated_at DESC);

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
  status text NOT NULL CHECK (status IN ('running','completed','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX task_runs_task_created_idx ON task_runs(task_id, created_at DESC);

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
  status text NOT NULL CHECK (status IN ('current','superseded','invalidated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, plan_version)
);
CREATE UNIQUE INDEX final_plans_one_current_idx
  ON final_plans(task_id) WHERE status = 'current';

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
  kind text NOT NULL CHECK (kind IN ('cart','checkout')),
  task_version bigint NOT NULL,
  plan_id uuid NOT NULL REFERENCES final_plans(plan_id),
  plan_version bigint NOT NULL,
  binding_version bigint NOT NULL,
  payload_hash text NOT NULL,
  provider_payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('active','consumed','expired','invalidated')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_confirmations_active_idx
  ON task_confirmations(task_id, kind, expires_at) WHERE status = 'active';

CREATE TABLE idempotency_records (
  account_id text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  task_id uuid NOT NULL REFERENCES tasks(task_id),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(account_id, operation, idempotency_key)
);
```

- [ ] **Step 6: Write and run migration integration tests**

Use `TEST_DATABASE_URL=postgresql:///jiaohu_task_state_test?host=/var/run/postgresql`. Reset only the test database schema, run migrations twice, assert all eight business tables exist, and assert the partial FinalPlan index rejects two current plans for one task.

Run:

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/db/config.test.ts server/db/migrate.test.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/config.ts server/db
git commit -m "feat: add PostgreSQL task state foundation"
```

---

### Task 2: Pure Task Rules and Canonical Snapshot Contract

**Files:**
- Modify: `src/domain/task-contract.ts`
- Rewrite: `server/tasks/task-coordinator.ts`
- Rewrite: `server/tasks/task-coordinator.test.ts`
- Modify: `server/tasks/hermes-task-contract.ts`
- Modify: `server/tasks/hermes-task-contract.test.ts`
- Modify: `server/tasks/routing-architecture.test.ts`

**Interfaces:**
- Produces: `TaskFinalPlan`, `TaskCandidate`, and extended `TaskSnapshot`.
- Produces: `TaskDecision { next: TaskState; invalidatePlan: boolean; invalidateConfirmations: boolean }`.
- Produces: pure `resolveNewTask`, `resolveContinuation`, `transition`, and `policyFor`.

- [ ] **Step 1: Write failing tests proving TaskCoordinator is stateless and policy matches actions**

Tests must instantiate no repository, call the same rule function with identical input twice, and receive identical decisions. Add assertions:

```ts
expect(Object.getOwnPropertyNames(coordinator)).not.toContain("#tasks");
expect(policyFor(editingWithResearch)).toMatchObject({
  allowedCapabilities: [
    "commerce.catalog.search",
    "task.plan.submit",
  ],
  nextActions: ["search_catalog", "revise_plan", "start_new_task"],
});
expect(policyFor(quantityOnlyEdit)).toMatchObject({
  allowedCapabilities: ["task.plan.submit"],
  nextActions: ["revise_plan", "start_new_task"],
});
```

Extend the architecture test to reject `new Map` in `server/tasks/task-coordinator.ts` and reject repository imports.

- [ ] **Step 2: Run RED**

```bash
npx vitest run server/tasks/task-coordinator.test.ts server/tasks/hermes-task-contract.test.ts server/tasks/routing-architecture.test.ts --maxWorkers=1
```

Expected: FAIL because coordinator still stores snapshots and `task.plan.submit` does not exist.

- [ ] **Step 3: Extend the public contract**

Add:

```ts
export type TaskCapability =
  | "task.plan.submit"
  | "commerce.catalog.search"
  | "commerce.catalog.meal-search"
  | "commerce.cart.read"
  | "commerce.cart.prepare"
  | "commerce.cart.write"
  | "commerce.checkout.preview"
  | "commerce.order.create"
  | "commerce.payment.read"
  | "delivery.quote"
  | "delivery.order.create"
  | "home.device.read"
  | "home.device.control"
  | "calendar.event.read"
  | "calendar.event.create";

export interface TaskFinalPlan {
  planId: string;
  version: number;
  title: string;
  explanation: string;
  totalCents: number;
  currency: "CNY";
}

export interface TaskSnapshot {
  taskId: string;
  version: number;
  requestText: string;
  domain: TaskDomain;
  goal: TaskGoal;
  phase: TaskPhase;
  context: TaskContext;
  finalPlan?: TaskFinalPlan;
  requestedCapabilities: TaskCapability[];
  allowedCapabilities: TaskCapability[];
  nextActions: TaskAction[];
}
```

- [ ] **Step 4: Replace stateful methods with pure decisions**

```ts
export interface TaskState {
  taskId: string;
  version: number;
  requestText: string;
  domain: TaskDomain;
  goal: TaskGoal;
  phase: TaskPhase;
  peopleCount?: number;
  budgetCents?: number;
  dietaryRequirements: string[];
  requirements: string[];
  requestedCapabilities: TaskCapability[];
}

export interface TaskDecision {
  next: TaskState;
  invalidatePlan: boolean;
  invalidateConfirmations: boolean;
}

export class TaskCoordinator {
  resolveNewTask(taskId: string, input: string): TaskDecision;
  resolveContinuation(current: TaskSnapshot, input: string): TaskDecision;
  transition(current: TaskSnapshot, phase: TaskPhase): TaskDecision;
  policyFor(state: Pick<TaskState, "phase" | "requestedCapabilities">): {
    allowedCapabilities: TaskCapability[];
    nextActions: TaskAction[];
  };
}
```

The coordinator must not increment a persisted version itself. Decisions preserve `current.version`; the repository increments it during compare-and-swap.

- [ ] **Step 5: Serialize complete safe Hermes context**

`buildHermesTaskContract(task)` must embed a JSON block containing goal, phase, people count, budget, dietary requirements, requirements, current FinalPlan, selected products, latest request, and allowed capabilities. It must specify legal tool order and list every forbidden Pupu tool.

A search contract grants exactly one search tool plus `submit_final_plan`; a quantity-only edit grants only `submit_final_plan`. A prose-only completion is explicitly invalid.

- [ ] **Step 6: Run GREEN and commit**

```bash
npx vitest run server/tasks/task-coordinator.test.ts server/tasks/hermes-task-contract.test.ts server/tasks/routing-architecture.test.ts --maxWorkers=1
git add src/domain/task-contract.ts server/tasks
git commit -m "refactor: make task coordinator a pure rules layer"
```

---

### Task 3: PostgreSQL Task Repository, Owner Identity, and Application Service

**Files:**
- Create: `server/tasks/task-owner.ts`
- Create: `server/tasks/task-owner.test.ts`
- Create: `server/tasks/task-repository.ts`
- Create: `server/tasks/task-repository.integration.test.ts`
- Create: `server/tasks/task-application-service.ts`
- Create: `server/tasks/task-application-service.test.ts`
- Create: `server/tasks/task-router.ts`
- Create: `server/tasks/task-router.test.ts`
- Modify: `server/chat-handler.ts`
- Modify: `server/chat-handler.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: `TaskOwner { ownerId: string; setCookie?: string }`.
- Produces: `TaskRepository.loadSnapshot(client, ownerId, taskId)`.
- Produces: `TaskApplicationService.resolve(owner, input, taskId?)`.
- Produces: `GET /api/tasks/:taskId`.

- [ ] **Step 1: Write RED tests for restart, ownership, and optimistic concurrency**

Repository integration tests must:

1. create a task through repository instance A;
2. create repository instance B with a new pool/client;
3. load the identical TaskSnapshot through B;
4. attempt two writes with the same expected version;
5. assert one succeeds and one returns `TaskConflictError`;
6. assert a different owner receives not-found.

Owner-cookie tests must require a 32-byte base64url opaque value, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` only on HTTPS.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks/task-owner.test.ts server/tasks/task-repository.integration.test.ts server/tasks/task-application-service.test.ts --maxWorkers=1
```

Expected: FAIL because repository and service do not exist.

- [ ] **Step 3: Implement owner identity and repository projection**

The repository contract must be:

```ts
export interface TaskRepository {
  create(client: PoolClient, ownerId: string, state: TaskState): Promise<TaskSnapshot>;
  loadSnapshot(client: PoolClient, ownerId: string, taskId: string): Promise<TaskSnapshot>;
  applyDecision(
    client: PoolClient,
    ownerId: string,
    expectedVersion: number,
    decision: TaskDecision,
  ): Promise<TaskSnapshot>;
  attachProviderAccount(
    client: PoolClient,
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    providerAccountId: string,
  ): Promise<TaskSnapshot>;
}
```

`loadSnapshot` must join current address binding, current FinalPlan, and ordered FinalPlan items in one transactionally consistent read. It must construct `context.selectedProducts`; no JSON selected-products column is allowed.

- [ ] **Step 4: Implement the application service**

```ts
export class TaskApplicationService {
  constructor(
    private readonly pool: Pool,
    private readonly repository: TaskRepository,
    private readonly coordinator: TaskCoordinator,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  resolve(command: {
    ownerId: string;
    input: string;
    taskId?: string;
  }): Promise<TaskSnapshot>;

  get(ownerId: string, taskId: string): Promise<TaskSnapshot>;
}
```

`resolve` must execute load, pure decision, compare-and-swap update, and final projection in one transaction.

- [ ] **Step 5: Route chat and task reads through the service**

Replace direct `TaskCoordinator.resolve/resume/transition` calls. `handleChatRequest` receives `taskService` and `ownerId`; `server/index.ts` resolves the owner cookie before dispatch.

Add `GET /api/tasks/:taskId`, returning 404 for a different owner and `cache-control: no-store`.

- [ ] **Step 6: Run GREEN and commit**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks server/chat-handler.test.ts --maxWorkers=1
git add server/tasks server/chat-handler.ts server/chat-handler.test.ts server/index.ts
git commit -m "feat: persist task snapshots in PostgreSQL"
```

---

### Task 4: Persist Task-Scoped Address Binding

**Files:**
- Modify: `server/pupu/address-controller.ts`
- Modify: `server/pupu/address-controller.test.ts`
- Modify: `server/pupu/address-router.ts`
- Modify: `server/pupu/address-router.test.ts`
- Modify: `src/ai/pupu-address-client.ts`
- Modify: `src/ai/useLiveJourney.ts`
- Modify: `src/ai/useLiveJourney.login.test.tsx`
- Modify: `server/tasks/task-repository.ts`
- Modify: `server/tasks/task-application-service.ts`

**Interfaces:**
- Produces: `bindAddress(ownerId, taskId, expectedVersion, providerAccountId, binding)`.
- Changes: address select requires `taskId` and `taskVersion`, and returns `{ task: TaskSnapshot }`.

- [ ] **Step 1: Write RED tests**

Require:

- address selection writes `TaskSnapshot.context.addressBinding`;
- a new service instance reads it after restart;
- selecting an address for another owner or provider account fails;
- changing binding invalidates current FinalPlan and active confirmations;
- the response contains the incremented TaskSnapshot;
- `PupuAddressController` has no `selections` map and no `getSelection`.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/pupu/address-controller.test.ts server/pupu/address-router.test.ts server/tasks/task-repository.integration.test.ts src/ai/useLiveJourney.login.test.tsx --maxWorkers=1
```

- [ ] **Step 3: Make the controller a provider lookup adapter**

Keep its bounded address-list cache only if clearly non-authoritative. `select` returns a validated `AddressSelection` but stores nothing:

```ts
async resolveSelection(
  scope: PupuCommerceScope,
  receiverId: string,
): Promise<AddressSelection> {
  const address = this.addresses.get(scope.accountId)?.get(receiverId);
  if (!address || !isUsable(address)) {
    throw new Error("Saved address is not available for this account");
  }
  return {
    receiverId: address.id,
    storeId: address.service_store_id,
    placeId: address.place.id,
    placeZip: address.place.zip,
  };
}
```

- [ ] **Step 4: Bind through TaskApplicationService**

The address route reads `taskId/taskVersion`, resolves the provider-owned receiver, then transactionally writes `task_address_bindings`, increments `binding_version`, invalidates current plans and confirmations, and returns the new TaskSnapshot.

Update readiness and scope-ticket creation to read the binding from TaskSnapshot, not from AddressController.

- [ ] **Step 5: Update the client and verify GREEN**

```ts
select(task: { taskId: string; version: number }, receiverId: string) {
  return post<{ task: TaskSnapshot }>("/api/pupu/addresses/select", {
    taskId: task.taskId,
    taskVersion: task.version,
    receiverId,
  });
}
```

Run the tests from Step 2, then commit:

```bash
git add server/pupu/address-* server/tasks src/ai/pupu-address-client.ts src/ai/useLiveJourney*
git commit -m "feat: bind delivery addresses to persisted tasks"
```

---

### Task 5: Persist Candidates and Require `submit_final_plan`

**Files:**
- Create: `server/tasks/final-plan.ts`
- Create: `server/tasks/final-plan.test.ts`
- Modify: `server/tasks/task-repository.ts`
- Modify: `server/tasks/task-application-service.ts`
- Modify: `server/chat-handler.ts`
- Modify: `server/chat-handler.test.ts`
- Modify: `server/tasks/hermes-task-contract.ts`
- Modify: `server/tasks/hermes-task-contract.test.ts`
- Modify: `src/ai/hermes-event-adapter.ts`
- Modify: `src/ai/hermes-event-adapter.test.ts`
- Create: `hermes/plugins/pupu_readonly/final_plan.py`
- Create: `hermes/plugins/pupu_readonly/tests/test_final_plan.py`
- Modify: `hermes/plugins/pupu_readonly/__init__.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_plugin.py`
- Modify: `hermes/plugins/pupu_readonly/scope_ticket.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_scope_ticket.py`
- Modify: `server/pupu/scope-ticket.ts`
- Modify: `server/pupu/scope-ticket.test.ts`

**Interfaces:**
- Produces: `submitFinalPlanSchema`.
- Produces: deterministic candidate IDs visible to Hermes.
- Produces: `TaskApplicationService.startRun`, `storeCandidates`, `submitFinalPlan`, and `finishRun`.

- [ ] **Step 1: Write RED tests for the single-plan invariant**

Tests must prove:

- provider results create candidates but leave `selectedProducts=[]`;
- `run.completed.summary` cannot create, filter, or reorder a plan;
- a run without `submit_final_plan` ends in a typed invalid-result state;
- submitting unknown, cross-task, cross-run, or out-of-stock candidates fails;
- valid submission computes totals from stored candidate prices;
- a stale task version cannot submit;
- quantity-only revision may reference only current-plan candidates;
- one transaction creates FinalPlan items, invalidates confirmations, advances phase, and increments Task version.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks/final-plan.test.ts server/chat-handler.test.ts src/ai/hermes-event-adapter.test.ts --maxWorkers=1
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python -m pytest \
  hermes/plugins/pupu_readonly/tests/test_final_plan.py -q
```

- [ ] **Step 3: Define and validate structured plan input**

```ts
export const submitFinalPlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(2_000),
  items: z.array(z.object({
    candidateId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(40),
}).strict();
```

Reject duplicate candidate IDs. Calculate every line and total with safe integers from database prices.

- [ ] **Step 4: Add candidate IDs to safe provider results**

Generate UUIDv5-compatible deterministic IDs from `taskId:taskVersion:sessionId:store_product_id` inside the scoped plugin output so Hermes can reference them. The server must independently recompute or validate the ID before inserting candidates.

Do not add candidate IDs to the external CLI or trust model-provided provider facts.

- [ ] **Step 5: Register `submit_final_plan` as a non-provider tool**

The Python handler validates only shape, binds task/run/version from the trusted scope, and persists a normal artifact:

```python
class FinalPlanItem(BaseModel):
    candidate_id: UUID
    quantity: int = Field(ge=1, le=20)

class FinalPlanSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    explanation: str = Field(min_length=1, max_length=2000)
    items: list[FinalPlanItem] = Field(min_length=1, max_length=40)
```

It performs no database write and invokes no Pupu CLI command. The Node server reads its artifact and performs authoritative PostgreSQL validation.

- [ ] **Step 6: Commit candidates and FinalPlan through the application service**

On search-tool completion, parse the safe artifact and persist candidates. On `submit_final_plan` completion, call:

```ts
submitFinalPlan(command: {
  ownerId: string;
  taskId: string;
  expectedVersion: number;
  runId: string;
  mode: "search" | "quantity_revision";
  input: SubmitFinalPlanInput;
}): Promise<TaskSnapshot>;
```

Emit the returned `task.updated`. A subsequent `run.completed` emits summary copy without any item mutation.

- [ ] **Step 7: Delete summary inference and verify GREEN**

Delete `selectMealProducts`. Change `journeyResult` so it never receives candidate products and never produces authoritative items.

Run:

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks server/chat-handler.test.ts src/ai/hermes-event-adapter.test.ts --maxWorkers=1
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python -m pytest hermes/plugins/pupu_readonly/tests -q
```

Expected: all pass. Commit:

```bash
git add server/tasks server/chat-handler* server/pupu/scope-ticket* src/ai/hermes-event-adapter* hermes/plugins/pupu_readonly
git commit -m "feat: require structured Hermes final plans"
```

---

### Task 6: Render and Restore Final Plans Only from TaskSnapshot

**Files:**
- Modify: `src/components/journey/types.ts`
- Modify: `src/components/journey/journey-reducer.ts`
- Modify: `src/components/journey/journey-reducer.test.ts`
- Modify: `src/components/journey/JourneyPresentationRenderer.tsx`
- Modify: `src/components/journey/JourneyPresentationRenderer.test.tsx`
- Modify: `src/components/pupu/PupuPurchaseCard.tsx`
- Modify: `src/components/pupu/PupuPurchaseCard.test.tsx`
- Modify: `src/ai/useLiveJourney.ts`
- Modify: `src/ai/useLiveJourney.test.tsx`
- Create: `src/ai/task-client.ts`
- Create: `src/ai/task-client.test.ts`
- Modify: `tests/contract/journey-stream.ts`
- Modify: `tests/contract/liquid-journey.contract.spec.ts`

**Interfaces:**
- Produces: `createTaskClient().get(taskId): Promise<TaskSnapshot>`.
- Changes: final product card accepts `task: TaskSnapshot`, not a Hermes purchase-plan presentation.
- Changes: reducer derives final-plan visibility from `snapshot.task.finalPlan`.

- [ ] **Step 1: Write RED reducer and renderer tests**

Require:

- candidate `presentation.updated` cannot render a cart-ready product card;
- `task.updated` with FinalPlan renders exactly its ordered selectedProducts;
- later `stream.finished.summary` changes copy only and preserves item IDs and quantities;
- replacing TaskSnapshot replaces the whole visible plan;
- refresh restores the same plan through `GET /api/tasks/:taskId`;
- no `runId` is used as a plan ID.

- [ ] **Step 2: Run RED**

```bash
npx vitest run src/components/journey/journey-reducer.test.ts src/components/journey/JourneyPresentationRenderer.test.tsx src/components/pupu/PupuPurchaseCard.test.tsx src/ai/task-client.test.ts src/ai/useLiveJourney.test.tsx --maxWorkers=1
```

- [ ] **Step 3: Make TaskSnapshot the renderer input**

Change the card boundary to:

```ts
interface PupuPurchaseCardProps {
  task: TaskSnapshot;
  instanceId: string;
  readOnly?: boolean;
}

const plan = task.finalPlan;
const products = task.context.selectedProducts;
if (!plan || products.length === 0) return null;
```

Use `plan.planId` for confirmation identity, `plan.totalCents` for totals, and `plan.title/explanation` for copy.

- [ ] **Step 4: Remove final purchase-plan presentation mutations**

The Hermes adapter may emit progress traces but not `component: "pupu.purchase-plan"`. The reducer must not merge `stream.finished.result.items` into a presentation.

Render the final plan whenever the task has `finalPlan` and its phase is one of `awaiting_cart_confirmation`, `writing_cart`, `awaiting_order_confirmation`, `creating_order`, `awaiting_payment`, or `completed`.

- [ ] **Step 5: Add refresh recovery**

```ts
export function createTaskClient(fetchImpl = fetch) {
  return {
    async get(taskId: string): Promise<TaskSnapshot> {
      const response = await fetchImpl(`/api/tasks/${encodeURIComponent(taskId)}`);
      if (!response.ok) throw new Error("Task could not be restored");
      return (await response.json() as { task: TaskSnapshot }).task;
    },
  };
}
```

Persist only the Task ID in browser navigation storage. If restore returns 404, clear the ID and start a new task; never reconstruct state from cached products.

- [ ] **Step 6: Run GREEN, browser contract, and commit**

```bash
npx vitest run src --maxWorkers=1
npm run test:browser
git add src tests/contract
git commit -m "refactor: render final plans from task snapshots"
```

---

### Task 7: PostgreSQL Confirmations and Durable Mutation Idempotency

**Files:**
- Create: `server/tasks/idempotency-repository.ts`
- Create: `server/tasks/idempotency-repository.integration.test.ts`
- Modify: `server/tasks/task-repository.ts`
- Modify: `server/tasks/task-application-service.ts`
- Modify: `server/pupu/cart-controller.ts`
- Modify: `server/pupu/cart-controller.test.ts`
- Modify: `server/pupu/checkout-controller.ts`
- Modify: `server/pupu/checkout-controller.test.ts`
- Rewrite: `server/pupu/commerce-router.ts`
- Rewrite: `server/pupu/commerce-router.test.ts`
- Modify: `src/ai/pupu-commerce-client.ts`
- Modify: `src/ai/pupu-commerce-client.test.ts`
- Modify: `src/components/pupu/PupuCartConfirmCard.tsx`
- Modify: `src/components/pupu/PupuCheckoutJourney.tsx`

**Interfaces:**
- Cart preview request: `{ taskId, taskVersion }`.
- Commit request: `{ taskId, taskVersion, confirmationId, idempotencyKey }`.
- Checkout uses the same identity-only pattern.
- Produces: durable `acquireIdempotency`, `completeIdempotency`, and `failIdempotency`.

- [ ] **Step 1: Write RED tests for identity-only requests and multi-instance races**

Require:

- cart preview rejects client `items`, prices, plan IDs, and addresses as authoritative input;
- preview reads FinalPlan and binding from PostgreSQL;
- stale plan/binding/task version rejects confirmation;
- two repository instances racing the same key invoke the fake provider once;
- replay returns the stored verified result;
- same key plus different request hash conflicts;
- checkout preview and order creation survive controller recreation;
- no real provider is called in tests.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks/idempotency-repository.integration.test.ts server/pupu/commerce-router.test.ts server/pupu/cart-controller.test.ts server/pupu/checkout-controller.test.ts src/ai/pupu-commerce-client.test.ts --maxWorkers=1
```

- [ ] **Step 3: Persist confirmations transactionally**

Cart preview loads the current TaskSnapshot, creates provider preview data, hashes this canonical payload:

```ts
const payloadHash = sha256(JSON.stringify({
  taskId: task.taskId,
  taskVersion: task.version,
  planId: task.finalPlan?.planId,
  planVersion: task.finalPlan?.version,
  bindingVersion,
  items: task.context.selectedProducts.map(({ productId, quantity, unitPriceCents }) => ({
    productId, quantity, unitPriceCents,
  })),
}));
```

Insert `task_confirmations` and return the incremented TaskSnapshot. The provider payload is server-derived and stored for later commit verification.

- [ ] **Step 4: Implement durable idempotency acquisition**

```ts
type AcquireResult =
  | { kind: "acquired" }
  | { kind: "replay"; result: unknown }
  | { kind: "in_progress" };

acquire(client, input): Promise<AcquireResult>;
succeed(client, key, result): Promise<void>;
fail(client, key, errorCode): Promise<void>;
```

Use `INSERT ... ON CONFLICT DO NOTHING`, then `SELECT ... FOR UPDATE`. Reject a request-hash mismatch. Provider I/O must occur only for the acquired executor. Store a verified result before marking succeeded.

- [ ] **Step 5: Make cart and checkout controllers stateless**

Remove `plans`, `previews`, `commits`, and `creations`. Controllers accept canonical stored confirmation payloads and perform provider I/O only:

```ts
cartController.commit(scope, binding, actorId, storedConfirmation);
checkoutController.preview(scope, binding);
checkoutController.create(scope, binding, actorId, storedConfirmation);
```

- [ ] **Step 6: Simplify client requests**

```ts
previewCart(task) =>
  post("/api/pupu/cart/preview", task, {});

commitCart(task, confirmationId) =>
  post("/api/pupu/cart/commit", task, {
    confirmationId,
    idempotencyKey: `cart-${crypto.randomUUID()}`,
  });
```

Apply the same structure to checkout. UI always replaces its task with the server response.

- [ ] **Step 7: Run GREEN and commit**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks server/pupu/commerce-router.test.ts server/pupu/cart-controller.test.ts server/pupu/checkout-controller.test.ts src/ai/pupu-commerce-client.test.ts --maxWorkers=1
git add server/tasks server/pupu src/ai src/components/pupu
git commit -m "feat: persist confirmations and mutation idempotency"
```

---

### Task 8: Remove Business-State Maps, Add Retention, and Verify Cutover

**Files:**
- Delete obsolete plan-registration code from: `server/chat-handler.ts`
- Delete obsolete map state from: `server/pupu/address-controller.ts`
- Delete obsolete map state from: `server/pupu/cart-controller.ts`
- Delete obsolete map state from: `server/pupu/checkout-controller.ts`
- Modify: `server/tasks/routing-architecture.test.ts`
- Create: `server/tasks/task-retention.ts`
- Create: `server/tasks/task-retention.integration.test.ts`
- Modify: `server/index.ts`
- Modify: `README.md`
- Create: `deploy/postgres/env.example`
- Create: `deploy/postgres/verify-readiness.sh`

**Interfaces:**
- Produces: `runTaskRetention(pool, now): Promise<RetentionResult>`.
- Produces: startup PostgreSQL health/migration gate.
- Removes: `registerPupuPlan` and all persistent-correctness maps.

- [ ] **Step 1: Write RED architecture and retention tests**

The architecture test must fail on these patterns in business-state files:

```ts
expect(taskCoordinatorSource).not.toMatch(/new Map/);
expect(addressControllerSource).not.toMatch(/selections\s*=\s*new Map/);
expect(cartControllerSource).not.toMatch(/plans\s*=\s*new Map|previews\s*=\s*new Map|commits\s*=\s*new Map/);
expect(checkoutControllerSource).not.toMatch(/previews\s*=\s*new Map|creations\s*=\s*new Map/);
expect(chatHandlerSource).not.toMatch(/registerPupuPlan/);
expect(adapterSource).not.toMatch(/selectMealProducts|summary.*includes|includes\(product\.name\)/);
```

Retention tests use a fixed clock and assert:

- unreferenced candidates older than 7 days are removed;
- candidates referenced by retained plans remain;
- terminal tasks older than 30 days are deleted;
- active tasks younger than 90 days remain;
- non-terminal tasks with no update for more than 90 days are deleted;
- confirmations and idempotency rows remain for at least 30 days.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql' \
  npx vitest run server/tasks/routing-architecture.test.ts server/tasks/task-retention.integration.test.ts --maxWorkers=1
```

- [ ] **Step 3: Remove obsolete state and implement retention**

`runTaskRetention` executes bounded SQL deletes in a transaction and returns counts. It is invoked by an explicit maintenance script or external timer, never synchronously in a user request.

At application startup:

1. create the pool;
2. run migrations;
3. execute `SELECT 1`;
4. construct repositories/services;
5. begin listening only after all four succeed.

No database failure may instantiate an in-memory substitute.

- [ ] **Step 4: Document exact runtime configuration**

`deploy/postgres/env.example`:

```dotenv
DATABASE_URL=postgresql:///jiaohu_task_state?host=/var/run/postgresql
DATABASE_POOL_MAX=4
```

README must explain migration, health verification, owner cookie, retention, FinalPlan invariants, and the no-live-mutation test boundary.

- [ ] **Step 5: Run complete verification**

```bash
export PATH=/home/pupu/.nvm/versions/node/v22.23.2/bin:$PATH
export TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql'
npm test -- --maxWorkers=1
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python -m pytest hermes/plugins/pupu_readonly/tests -q
npm run lint
npm run build
npm run test:browser
git diff --check
```

Expected:

- all Vitest files pass;
- all Python plugin tests pass;
- TypeScript lint passes;
- Vite production build succeeds;
- all read-only browser contracts pass;
- no real cart/order/payment mutation is executed.

- [ ] **Step 6: Verify restart and two-instance database behavior**

Run an integration harness that:

1. creates a task and FinalPlan through service instance A;
2. closes A's pool;
3. opens service instance B and loads the identical snapshot;
4. races two versioned transitions from separate connections;
5. confirms one winner and one conflict;
6. races the same idempotency key and confirms one fake-provider invocation.

Expected: PASS with identical task and plan IDs after recreation.

- [ ] **Step 7: Commit**

```bash
git add server src hermes README.md deploy/postgres package.json package-lock.json
git commit -m "refactor: make task snapshots the only business truth"
```

## Completion Gate

Before proposing merge or deployment, report separately:

- **Implemented:** committed PostgreSQL schema, repositories, structured FinalPlan, Task-only UI, persistent confirmations/idempotency, and removed maps.
- **Tested:** exact Vitest, PostgreSQL integration, Python, lint, build, and Playwright counts.
- **Not live-tested:** real cart write, real order creation, and payment.
- **Deployment status:** branch only until the user explicitly chooses merge/push/deploy.
