# PostgreSQL Task State and Structured FinalPlan Design

**Date:** 2026-08-14
**Status:** Approved
**Scope:** Make PostgreSQL the durable business-state authority and make TaskSnapshot the only application-facing source of truth.

## Problem

The first Task routing migration centralized task classification and capability policy, but it did not yet centralize durable business state.

The current implementation still has five correctness gaps:

1. `TaskCoordinator` stores snapshots in a process-local `Map`, so restart loses tasks, multiple instances disagree, and old entries never expire.
2. Hermes receives the current request and a tool instruction, but not the complete task context or current selected plan.
3. Hermes can describe a re-search action while the policy for `editing_plan` grants no real search capability.
4. Tool candidates are copied into `selectedProducts`, while a second path infers selected products by matching product names in Hermes summary text.
5. Address, cart-plan, preview, checkout-preview, and idempotency state also live in process-local maps. `TaskContext.addressBinding` exists but is not populated.

A shopping flow cannot tolerate two different interpretations of the final product list. Natural-language summaries must never determine items, quantities, price totals, confirmation bindings, cart writes, or order creation.

## Decisions

- PostgreSQL is the only durable business-state store.
- `TaskCoordinator` is a stateless rules component. It accepts current state plus a command and returns a decision; it performs no I/O and owns no cache or map.
- Hermes submits the chosen plan through a structured `submit_final_plan` tool.
- `run.completed.summary` remains human-readable text only.
- `TaskSnapshot.context.selectedProducts` remains in the public contract, but it is a read-only projection of the current `final_plan_items`; it is not stored independently.
- UI, Hermes, cart, and checkout consume the same repository-produced TaskSnapshot.
- PostgreSQL unavailability fails closed. There is no in-memory fallback for business state.
- Tests use fake providers and database fixtures. They do not perform live cart writes, order creation, or payment.

## Authoritative Data Model

### tasks

One row per task:

- `task_id uuid primary key`
- `owner_id text not null`
- `provider_account_id text null`
- `version bigint not null`
- `domain text not null`
- `goal text not null`
- `phase text not null`
- `request_text text not null`
- `people_count integer null`
- `budget_cents integer null`
- `dietary_requirements jsonb not null`
- `requirements jsonb not null`
- `requested_capabilities jsonb not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `terminal_at timestamptz null`

Every state-changing command uses optimistic concurrency:

```sql
UPDATE tasks
SET version = version + 1, phase = $next_phase, updated_at = now()
WHERE task_id = $task_id
  AND owner_id = $owner_id
  AND version = $expected_version
RETURNING version;
```

No returned row means a task conflict, never an implicit retry against stale input.

The server assigns an opaque, stable `owner_id` before provider login and scopes every task read to it. After Pupu login, the verified provider account is attached as `provider_account_id`; it never replaces task ownership.

### task_address_bindings

At most one current binding per task:

- `task_id uuid primary key references tasks(task_id) on delete cascade`
- `receiver_id text not null`
- `store_id text not null`
- `place_id text not null`
- `place_zip integer null`
- `binding_version bigint not null`
- `bound_at timestamptz not null`

Only provider identifiers are persisted. Full address text and phone numbers are not copied into task state.

Changing the binding increments the task version and invalidates the current FinalPlan and every unused confirmation in the same transaction.

### task_runs

Every Hermes execution is bound durably to one task version:

- `run_id text primary key`
- `task_id uuid not null references tasks(task_id) on delete cascade`
- `task_version bigint not null`
- `owner_id text not null`
- `allowed_capabilities jsonb not null`
- `status text not null` with values `running`, `completed`, `failed`, or `cancelled`
- `created_at timestamptz not null`
- `completed_at timestamptz null`

The run row is inserted before Hermes execution begins. Candidate and FinalPlan writes must reference it, so another server instance can verify run ownership, version, capability, and terminal state without process memory.

### task_product_candidates

Immutable candidates obtained from an authenticated live provider call:

- `candidate_id uuid primary key`
- `task_id uuid not null references tasks(task_id) on delete cascade`
- `task_version bigint not null`
- `run_id text not null`
- `tool_call_id text not null`
- `store_product_id text not null`
- `provider_product_id text null`
- `name text not null`
- `specification text null`
- `unit_price_cents integer not null`
- `in_stock boolean not null`
- `evidence_ref text null`
- `collected_at timestamptz not null`
- unique `(task_id, run_id, store_product_id)`

Candidates are evidence, not selected products. Writing candidates never moves the task to cart confirmation.

### final_plans

One current plan version per task, with prior versions retained for audit:

- `plan_id uuid primary key`
- `task_id uuid not null references tasks(task_id) on delete cascade`
- `plan_version bigint not null`
- `task_version bigint not null`
- `run_id text not null`
- `title text not null`
- `explanation text not null`
- `currency text not null check (currency = 'CNY')`
- `total_cents integer not null`
- `status text not null` with values `current`, `superseded`, or `invalidated`
- `created_at timestamptz not null`
- unique `(task_id, plan_version)`
- partial unique index enforcing one `current` row per task

### final_plan_items

The only canonical selected-product rows:

- `plan_id uuid not null references final_plans(plan_id) on delete cascade`
- `candidate_id uuid not null references task_product_candidates(candidate_id)`
- `position integer not null`
- `quantity integer not null check (quantity between 1 and 20)`
- `unit_price_cents integer not null`
- `line_total_cents integer not null`
- primary key `(plan_id, candidate_id)`
- unique `(plan_id, position)`

Names, provider IDs, and specifications shown in TaskSnapshot are joined from the referenced candidate. The submitted model output cannot override provider facts or prices.

### task_confirmations

A single table for cart and checkout confirmations:

- `confirmation_id uuid primary key`
- `task_id uuid not null references tasks(task_id) on delete cascade`
- `kind text not null` with values `cart` or `checkout`
- `task_version bigint not null`
- `plan_id uuid not null references final_plans(plan_id)`
- `plan_version bigint not null`
- `binding_version bigint not null`
- `payload_hash text not null`
- `provider_payload jsonb not null`
- `status text not null` with values `active`, `consumed`, `expired`, or `invalidated`
- `expires_at timestamptz not null`
- `consumed_at timestamptz null`
- `created_at timestamptz not null`

A confirmation is usable only when its task, plan, address binding, hash, status, and expiry all still match.

### idempotency_records

Durable coordination for real mutations:

- `account_id text not null`
- `operation text not null`
- `idempotency_key text not null`
- `request_hash text not null`
- `task_id uuid not null references tasks(task_id)`
- `status text not null` with values `running`, `succeeded`, or `failed`
- `result jsonb null`
- `error_code text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `expires_at timestamptz not null`
- primary key `(account_id, operation, idempotency_key)`

The unique key and row lock ensure only one server instance performs a mutation. Reusing a key with a different request hash is rejected.

## Application Boundaries

### TaskRepository

`TaskRepository` owns PostgreSQL persistence and exposes transaction-aware operations:

- load a task scoped to the authenticated owner;
- assemble a complete TaskSnapshot;
- store candidates;
- replace the current FinalPlan;
- bind an address;
- create, consume, expire, and invalidate confirmations;
- acquire and complete idempotency records;
- archive expired state.

The repository is the only component allowed to assemble TaskSnapshot. It projects `context.selectedProducts` from the current FinalPlan items and projects `context.addressBinding` from the task binding row.

The public TaskSnapshot adds FinalPlan metadata without duplicating item storage:

```ts
interface TaskFinalPlan {
  planId: string;
  version: number;
  title: string;
  explanation: string;
  totalCents: number;
  currency: "CNY";
}
```

`TaskSnapshot.finalPlan` is absent until a plan has been validated. Its items are always `context.selectedProducts`, assembled from the same `final_plan_items` rows in the same database read.

### TaskCoordinator

`TaskCoordinator` becomes a pure rules object. Representative operations are:

- `resolveNewTask(input)`
- `resolveContinuation(current, input)`
- `decideTransition(current, command)`
- `policyFor(current)`
- `validateFinalPlanCommand(current, command)`

It returns a decision or domain error. It never opens a database connection, stores a snapshot, allocates a confirmation, or invokes a provider.

### TaskApplicationService

The application service owns transaction boundaries:

1. resolve the stable owner and any verified provider account;
2. begin transaction;
3. load and lock current task where required;
4. call TaskCoordinator;
5. persist the decision through TaskRepository;
6. commit;
7. return the newly assembled TaskSnapshot.

All routes call this service instead of directly mutating controllers.

## Structured Hermes FinalPlan

The current Hermes `run.completed` event contains a string, so structured plan selection uses a tool boundary.

The legal search sequence is:

```text
search tool -> persist provider candidates -> submit_final_plan -> validate and commit -> run.completed
```

`submit_final_plan` accepts:

```ts
interface SubmitFinalPlanInput {
  title: string;
  explanation: string;
  items: Array<{
    candidateId: string;
    quantity: number;
  }>;
}
```

Task ID, expected Task version, owner ID, provider account ID, and run ID come from the server-issued execution scope. The model cannot supply or replace them.

The server accepts the artifact only when:

- the task is in `searching_catalog` or an allowed plan-editing path;
- the run belongs to the task and expected version;
- for a search finalization, every candidate belongs to that task and current run;
- for a quantity-only revision, every candidate is referenced by the current valid FinalPlan;
- every candidate came from a successful authorized provider tool result;
- every selected item was in stock when collected;
- quantities and item counts are within policy;
- calculated totals satisfy integer and overflow constraints;
- no unapproved provider capability was used.

On success, one PostgreSQL transaction supersedes the old plan, inserts the new plan and items, invalidates confirmations, changes the task to `awaiting_cart_confirmation`, and increments task version.

Hermes receives a serialized safe TaskSnapshot context on every run: goal, phase, people count, budget, dietary requirements, other requirements, current FinalPlan, latest user input, and allowed capabilities. It does not receive cookies, tokens, phone numbers, full addresses, signing material, or payment secrets.

For a plan edit:

- quantity-only edits may submit a new FinalPlan using candidates already referenced by the current plan;
- replacement or re-search requests transition to `searching_catalog` and grant the corresponding real search capability;
- displayed next actions are derived from the same policy that grants tools.

## UI and GenUI

`task.updated` is the only event that can publish a final product plan.

Temporary `presentation.updated` events remain valid for login, address selection, provider progress, and candidate-search progress. They cannot become a cart-ready plan.

The product-plan UI renders from the newest TaskSnapshot:

- FinalPlan title and explanation;
- `context.selectedProducts`;
- server-calculated total;
- current task and plan versions;
- allowed next actions.

`stream.finished.summary` is conversation copy only. It cannot filter products or mutate presentation data. `selectMealProducts(summary)` and all name-matching selection logic are deleted.

A refresh restores state from `GET /api/tasks/:taskId`, scoped to the authenticated owner. The client may cache a Task ID for navigation, but cached task content is never authoritative.

## Address, Cart, and Checkout

Selecting an address requires the current Task ID and version. The server validates that the receiver belongs to the authenticated Pupu account, stores the binding on the task, invalidates stale plans and confirmations, and returns the new TaskSnapshot.

Cart preview accepts only Task identity and expected version. The server reads FinalPlan items and address binding from PostgreSQL and creates a bound confirmation. The client cannot submit product names, prices, totals, or an alternate address as facts.

Cart commit accepts only Task identity, expected version, confirmation ID, and idempotency key. Checkout preview and order creation follow the same rule. Provider results are recorded before the response is returned so another instance can replay the verified outcome.

The in-memory plan registry, address selection map, cart preview map, checkout preview map, and mutation promise maps are removed after their PostgreSQL paths are covered.

## Failure and Concurrency Semantics

- Missing PostgreSQL connectivity returns an unavailable error and disables business writes.
- Task version mismatch returns a conflict with the latest safe TaskSnapshot.
- A stale FinalPlan artifact cannot overwrite a newer task version.
- Address changes invalidate all derived state atomically.
- Expired confirmations are rejected even before cleanup runs.
- A duplicate idempotency key with the same request hash returns the stored result.
- A duplicate idempotency key with a different request hash returns a conflict.
- If a provider result is uncertain, the idempotency record remains non-successful and the system does not claim completion.
- No process-local cache is required for correctness.

## Retention

- Active and awaiting-confirmation tasks: 90 days.
- Completed, cancelled, or blocked tasks: delete after 30 days.
- Product candidates: 7 days unless referenced by a retained FinalPlan.
- Expired confirmations: 30 days.
- Idempotency results: at least 30 days.

Cleanup runs outside request transactions. It deletes terminal tasks after 30 days, deletes non-terminal tasks with no update for 90 days, deletes expired confirmations and idempotency records after 30 days, and deletes candidates older than 7 days only when no retained FinalPlan references them.

## Migration Sequence

1. Add PostgreSQL configuration, connection health checks, SQL migrations, and repository integration tests.
2. Introduce pure TaskCoordinator decisions and PostgreSQL-backed TaskApplicationService.
3. Persist tasks and task-scoped address bindings; add account-scoped task reads and refresh recovery.
4. Persist provider candidates and implement `submit_final_plan` through the existing artifact boundary.
5. Render the final product plan only from TaskSnapshot and remove summary-based selection.
6. Move cart and checkout confirmations to PostgreSQL.
7. Move mutation idempotency to PostgreSQL.
8. Remove process-local business-state maps and the old plan registration chain.
9. Add restart, multi-instance, stale-version, address-invalidation, plan-conflict, confirmation-expiry, and idempotency-race tests.
10. Run unit, PostgreSQL integration, Python plugin, browser contract, lint, and build verification with fake providers only.

Because current tasks and selections exist only in memory, there is no durable legacy business data to backfill. Deployment starts with the new schema and invalidates any pre-deployment browser-held Task IDs cleanly.

## Acceptance Criteria

- Restarting the server preserves task, address binding, FinalPlan, confirmations, and idempotency results.
- Two server instances read the same TaskSnapshot and cannot both win a versioned transition or mutation lease.
- Hermes receives complete safe task context and only actually granted tools.
- Re-search actions and allowed capabilities never disagree.
- Hermes must call `submit_final_plan`; a prose-only completion cannot create a cart-ready plan.
- Selected products originate only from validated FinalPlan items.
- UI, cart preview, cart commit, checkout preview, and order creation consume the same TaskSnapshot projection.
- No natural-language summary is used for product identity or quantity.
- No process-local Map is required for persistent business correctness.
- Real cart, order, and payment actions remain disabled during automated acceptance tests.
