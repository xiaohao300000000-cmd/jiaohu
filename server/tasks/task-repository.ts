import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  TaskAddressBinding,
  TaskCapability,
  TaskDomain,
  TaskGoal,
  TaskPhase,
  TaskProduct,
  TaskSnapshot,
} from "../../src/domain/task-contract";
import {
  deterministicCandidateId,
  submitFinalPlanSchema,
  type SubmitFinalPlanInput,
} from "./final-plan";

export interface CandidateInput {
  candidateId: string;
  storeProductId: string;
  providerProductId?: string;
  name: string;
  specification?: string;
  unitPriceCents: number;
  inStock: boolean;
  evidenceRef?: string;
  collectedAt: string;
}

export type ConfirmationKind = "cart" | "checkout";

export interface StoredConfirmation {
  confirmationId: string;
  kind: ConfirmationKind;
  taskVersion: number;
  payloadHash: string;
  payload: unknown;
  expiresAt: string;
}

interface ConfirmationRow {
  confirmation_id: string;
  kind: ConfirmationKind;
  task_version: string;
  payload_hash: string;
  provider_payload: unknown;
  expires_at: Date;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  }
  return value;
}

function payloadHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(payload)))
    .digest("hex");
}
import {
  policyFor,
  TaskConflictError,
  type TaskDecision,
} from "./task-coordinator";

export class TaskNotFoundError extends Error {
  constructor() {
    super("task was not found");
    this.name = "TaskNotFoundError";
  }
}

interface TaskRow {
  task_id: string;
  version: string;
  domain: TaskDomain;
  goal: TaskGoal;
  phase: TaskPhase;
  request_text: string;
  provider_account_id: string | null;
  people_count: number | null;
  budget_cents: number | null;
  dietary_requirements: unknown;
  requirements: unknown;
  requested_capabilities: unknown;
  receiver_id: string | null;
  store_id: string | null;
  place_id: string | null;
  place_zip: number | null;
  binding_version: string | null;
  plan_id: string | null;
  plan_version: string | null;
  title: string | null;
  explanation: string | null;
  total_cents: number | null;
  currency: "CNY" | null;
}

interface ItemRow {
  product_id: string;
  provider_product_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class PostgresTaskRepository {
  async create(
    client: PoolClient,
    ownerId: string,
    state: TaskSnapshot,
  ): Promise<TaskSnapshot> {
    await client.query(
      `INSERT INTO tasks (
        task_id, owner_id, version, domain, goal, phase, request_text,
        people_count, budget_cents, dietary_requirements, requirements,
        requested_capabilities
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10::jsonb, $11::jsonb, $12::jsonb
      )`,
      [
        state.taskId,
        ownerId,
        state.version,
        state.domain,
        state.goal,
        state.phase,
        state.requestText,
        state.context.peopleCount ?? null,
        state.context.budgetCents ?? null,
        JSON.stringify(state.context.dietaryRequirements),
        JSON.stringify(state.context.requirements),
        JSON.stringify(state.requestedCapabilities),
      ],
    );
    return this.loadSnapshot(client, ownerId, state.taskId);
  }

  async loadSnapshot(
    client: PoolClient,
    ownerId: string,
    taskId: string,
  ): Promise<TaskSnapshot> {
    const result = await client.query<TaskRow>(
      `SELECT
        t.task_id, t.version, t.domain, t.goal, t.phase, t.request_text,
        t.provider_account_id, t.people_count, t.budget_cents,
        t.dietary_requirements, t.requirements, t.requested_capabilities,
        b.receiver_id, b.store_id, b.place_id, b.place_zip, b.binding_version,
        p.plan_id, p.plan_version, p.title, p.explanation,
        p.total_cents, p.currency
      FROM tasks t
      LEFT JOIN task_address_bindings b ON b.task_id = t.task_id
      LEFT JOIN final_plans p
        ON p.task_id = t.task_id AND p.status = 'current'
      WHERE t.task_id = $1 AND t.owner_id = $2`,
      [taskId, ownerId],
    );
    const row = result.rows[0];
    if (!row) throw new TaskNotFoundError();

    let selectedProducts: TaskProduct[] = [];
    if (row.plan_id) {
      const items = await client.query<ItemRow>(
        `SELECT
          c.store_product_id AS product_id,
          c.provider_product_id,
          c.name,
          i.quantity,
          i.unit_price_cents
        FROM final_plan_items i
        JOIN task_product_candidates c ON c.candidate_id = i.candidate_id
        WHERE i.plan_id = $1
        ORDER BY i.position`,
        [row.plan_id],
      );
      selectedProducts = items.rows.map((item) => ({
        productId: item.product_id,
        providerProductId: item.provider_product_id ?? undefined,
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        source: "pupu_live",
      }));
    }

    const requestedCapabilities = strings(
      row.requested_capabilities,
    ) as TaskCapability[];
    const policy = policyFor(row.phase, requestedCapabilities);
    const addressBinding: TaskAddressBinding | undefined =
      row.receiver_id && row.store_id && row.place_id
        ? {
            receiverId: row.receiver_id,
            storeId: row.store_id,
            placeId: row.place_id,
            placeZip: row.place_zip ?? undefined,
          }
        : undefined;
    const confirmations = await client.query<ConfirmationRow>(
      `SELECT
        confirmation_id, kind, task_version, payload_hash,
        provider_payload, expires_at
       FROM task_confirmations
       WHERE task_id = $1
         AND status = 'active'
         AND expires_at > now()
       ORDER BY created_at DESC`,
      [taskId],
    );
    const cartConfirmation = confirmations.rows.find(
      (confirmation) => confirmation.kind === "cart",
    );
    const checkoutConfirmation = confirmations.rows.find(
      (confirmation) => confirmation.kind === "checkout",
    );

    return {
      taskId: row.task_id,
      version: Number(row.version),
      requestText: row.request_text,
      domain: row.domain,
      goal: row.goal,
      phase: row.phase,
      context: {
        peopleCount: row.people_count ?? undefined,
        budgetCents: row.budget_cents ?? undefined,
        dietaryRequirements: strings(row.dietary_requirements),
        requirements: strings(row.requirements),
        selectedProducts,
        addressBinding,
        ...(cartConfirmation
          ? {
              cartPreview: {
                id: cartConfirmation.confirmation_id,
                version: Number(cartConfirmation.task_version),
                expiresAt: cartConfirmation.expires_at.toISOString(),
              },
            }
          : {}),
        ...(checkoutConfirmation
          ? {
              checkoutPreview: {
                id: checkoutConfirmation.confirmation_id,
                version: Number(checkoutConfirmation.task_version),
                expiresAt: checkoutConfirmation.expires_at.toISOString(),
              },
            }
          : {}),
      },
      ...(row.plan_id
        ? {
            finalPlan: {
              planId: row.plan_id,
              version: Number(row.plan_version),
              title: row.title!,
              explanation: row.explanation!,
              totalCents: row.total_cents!,
              currency: row.currency!,
            },
          }
        : {}),
      requestedCapabilities,
      allowedCapabilities: policy.allowedCapabilities,
      nextActions: policy.nextActions,
    };
  }

  async applyDecision(
    client: PoolClient,
    ownerId: string,
    expectedVersion: number,
    decision: TaskDecision,
  ): Promise<TaskSnapshot> {
    const next = decision.next;
    const updated = await client.query(
      `UPDATE tasks SET
        version = version + 1,
        domain = $4,
        goal = $5,
        phase = $6,
        request_text = $7,
        people_count = $8,
        budget_cents = $9,
        dietary_requirements = $10::jsonb,
        requirements = $11::jsonb,
        requested_capabilities = $12::jsonb,
        updated_at = now(),
        terminal_at = CASE
          WHEN $6 = 'completed' THEN COALESCE(terminal_at, now())
          ELSE NULL
        END
      WHERE task_id = $1 AND owner_id = $2 AND version = $3`,
      [
        next.taskId,
        ownerId,
        expectedVersion,
        next.domain,
        next.goal,
        next.phase,
        next.requestText,
        next.context.peopleCount ?? null,
        next.context.budgetCents ?? null,
        JSON.stringify(next.context.dietaryRequirements),
        JSON.stringify(next.context.requirements),
        JSON.stringify(next.requestedCapabilities),
      ],
    );
    if (updated.rowCount !== 1) {
      throw new TaskConflictError("task version conflict");
    }

    if (decision.invalidatePlan) {
      await client.query(
        `UPDATE final_plans SET status = 'invalidated'
         WHERE task_id = $1 AND status = 'current'`,
        [next.taskId],
      );
    }
    if (decision.invalidateConfirmations) {
      await client.query(
        `UPDATE task_confirmations SET status = 'invalidated'
         WHERE task_id = $1 AND status = 'active'`,
        [next.taskId],
      );
    }
    return this.loadSnapshot(client, ownerId, next.taskId);
  }

  async attachProviderAccount(
    client: PoolClient,
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    providerAccountId: string,
  ): Promise<TaskSnapshot> {
    const result = await client.query(
      `UPDATE tasks SET
        provider_account_id = $4,
        version = version + 1,
        updated_at = now()
      WHERE task_id = $1 AND owner_id = $2 AND version = $3`,
      [taskId, ownerId, expectedVersion, providerAccountId],
    );
    if (result.rowCount !== 1) {
      throw new TaskConflictError("task version conflict");
    }
    return this.loadSnapshot(client, ownerId, taskId);
  }
  async bindAddress(
    client: PoolClient,
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    providerAccountId: string,
    binding: TaskAddressBinding,
  ): Promise<TaskSnapshot> {
    const updated = await client.query(
      `UPDATE tasks SET
        provider_account_id = $4,
        version = version + 1,
        updated_at = now()
      WHERE task_id = $1
        AND owner_id = $2
        AND version = $3
        AND (provider_account_id IS NULL OR provider_account_id = $4)`,
      [taskId, ownerId, expectedVersion, providerAccountId],
    );
    if (updated.rowCount !== 1) {
      throw new TaskConflictError("task owner, provider, or version conflict");
    }
    await client.query(
      `INSERT INTO task_address_bindings (
        task_id, receiver_id, store_id, place_id, place_zip,
        binding_version, bound_at
      ) VALUES ($1, $2, $3, $4, $5, 1, now())
      ON CONFLICT (task_id) DO UPDATE SET
        receiver_id = EXCLUDED.receiver_id,
        store_id = EXCLUDED.store_id,
        place_id = EXCLUDED.place_id,
        place_zip = EXCLUDED.place_zip,
        binding_version = task_address_bindings.binding_version + 1,
        bound_at = now()`,
      [
        taskId,
        binding.receiverId,
        binding.storeId,
        binding.placeId,
        binding.placeZip ?? null,
      ],
    );
    await client.query(
      `UPDATE final_plans SET status = 'invalidated'
       WHERE task_id = $1 AND status = 'current'`,
      [taskId],
    );
    await client.query(
      `UPDATE task_confirmations SET status = 'invalidated'
       WHERE task_id = $1 AND status = 'active'`,
      [taskId],
    );
    return this.loadSnapshot(client, ownerId, taskId);
  }
  async startRun(
    client: PoolClient,
    ownerId: string,
    taskId: string,
    taskVersion: number,
    runId: string,
  ): Promise<void> {
    const task = await this.loadSnapshot(client, ownerId, taskId);
    if (task.version !== taskVersion) {
      throw new TaskConflictError("task version conflict");
    }
    await client.query(
      `INSERT INTO task_runs (
        run_id, task_id, task_version, owner_id,
        allowed_capabilities, status
      ) VALUES ($1, $2, $3, $4, $5::jsonb, 'running')`,
      [
        runId,
        taskId,
        taskVersion,
        ownerId,
        JSON.stringify(task.allowedCapabilities),
      ],
    );
  }

  async storeCandidates(
    client: PoolClient,
    ownerId: string,
    taskId: string,
    taskVersion: number,
    runId: string,
    toolCallId: string,
    candidates: CandidateInput[],
  ): Promise<TaskSnapshot> {
    const task = await this.loadSnapshot(client, ownerId, taskId);
    if (task.version !== taskVersion) {
      throw new TaskConflictError("task version conflict");
    }
    const run = await client.query(
      `SELECT 1 FROM task_runs
       WHERE run_id = $1 AND task_id = $2 AND task_version = $3
         AND owner_id = $4 AND status = 'running'`,
      [runId, taskId, taskVersion, ownerId],
    );
    if (run.rowCount !== 1) throw new TaskConflictError("task run conflict");

    for (const candidate of candidates) {
      const expectedId = deterministicCandidateId(
        taskId,
        taskVersion,
        runId,
        candidate.storeProductId,
      );
      if (candidate.candidateId !== expectedId) {
        throw new TaskConflictError("candidate identity conflict");
      }
      await client.query(
        `INSERT INTO task_product_candidates (
          candidate_id, task_id, task_version, run_id, tool_call_id,
          store_product_id, provider_product_id, name, specification,
          unit_price_cents, in_stock, evidence_ref, collected_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (task_id, run_id, store_product_id) DO NOTHING`,
        [
          candidate.candidateId,
          taskId,
          taskVersion,
          runId,
          toolCallId,
          candidate.storeProductId,
          candidate.providerProductId ?? null,
          candidate.name,
          candidate.specification ?? null,
          candidate.unitPriceCents,
          candidate.inStock,
          candidate.evidenceRef ?? null,
          candidate.collectedAt,
        ],
      );
    }
    return this.loadSnapshot(client, ownerId, taskId);
  }

  async submitFinalPlan(
    client: PoolClient,
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    runId: string,
    mode: "search" | "quantity_revision",
    rawInput: SubmitFinalPlanInput,
  ): Promise<TaskSnapshot> {
    const input = submitFinalPlanSchema.parse(rawInput);
    const task = await this.loadSnapshot(client, ownerId, taskId);
    if (
      task.version !== expectedVersion ||
      !task.allowedCapabilities.includes("task.plan.submit")
    ) {
      throw new TaskConflictError("task cannot accept a final plan");
    }
    const run = await client.query(
      `SELECT 1 FROM task_runs
       WHERE run_id = $1 AND task_id = $2 AND owner_id = $3
         AND task_version = $4 AND status = 'running'`,
      [runId, taskId, ownerId, expectedVersion],
    );
    if (run.rowCount !== 1) throw new TaskConflictError("task run conflict");

    const ids = input.items.map((item) => item.candidateId);
    const candidates = await client.query<{
      candidate_id: string;
      store_product_id: string;
      provider_product_id: string | null;
      name: string;
      unit_price_cents: number;
      in_stock: boolean;
    }>(
      `SELECT DISTINCT
        c.candidate_id, c.store_product_id, c.provider_product_id,
        c.name, c.unit_price_cents, c.in_stock
      FROM task_product_candidates c
      WHERE c.task_id = $1
        AND c.candidate_id = ANY($2::uuid[])
        AND (
          c.run_id = $3 OR (
            $4 = 'quantity_revision' AND EXISTS (
              SELECT 1
              FROM final_plan_items i
              JOIN final_plans p ON p.plan_id = i.plan_id
              WHERE p.task_id = $1
                AND p.status = 'current'
                AND i.candidate_id = c.candidate_id
            )
          )
        )`,
      [taskId, ids, runId, mode],
    );
    if (
      candidates.rows.length !== ids.length ||
      candidates.rows.some((candidate) => !candidate.in_stock)
    ) {
      throw new TaskConflictError("final plan contains unavailable candidates");
    }
    const byId = new Map(
      candidates.rows.map((candidate) => [candidate.candidate_id, candidate]),
    );
    let totalCents = 0;
    const lines = input.items.map((item, position) => {
      const candidate = byId.get(item.candidateId)!;
      const lineTotalCents = candidate.unit_price_cents * item.quantity;
      if (!Number.isSafeInteger(lineTotalCents)) {
        throw new TaskConflictError("final plan total is unsafe");
      }
      totalCents += lineTotalCents;
      if (!Number.isSafeInteger(totalCents)) {
        throw new TaskConflictError("final plan total is unsafe");
      }
      return { item, position, candidate, lineTotalCents };
    });

    const versionResult = await client.query<{ next: string }>(
      `SELECT COALESCE(MAX(plan_version), 0) + 1 AS next
       FROM final_plans WHERE task_id = $1`,
      [taskId],
    );
    const planVersion = Number(versionResult.rows[0].next);
    const planId = crypto.randomUUID();
    await client.query(
      `UPDATE final_plans SET status = 'superseded'
       WHERE task_id = $1 AND status = 'current'`,
      [taskId],
    );
    await client.query(
      `INSERT INTO final_plans (
        plan_id, task_id, plan_version, task_version, run_id,
        title, explanation, currency, total_cents, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CNY', $8, 'current')`,
      [
        planId,
        taskId,
        planVersion,
        expectedVersion + 1,
        runId,
        input.title,
        input.explanation,
        totalCents,
      ],
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO final_plan_items (
          plan_id, candidate_id, position, quantity,
          unit_price_cents, line_total_cents
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          planId,
          line.item.candidateId,
          line.position,
          line.item.quantity,
          line.candidate.unit_price_cents,
          line.lineTotalCents,
        ],
      );
    }
    const updated = await client.query(
      `UPDATE tasks SET
        version = version + 1,
        phase = 'awaiting_cart_confirmation',
        updated_at = now()
      WHERE task_id = $1 AND owner_id = $2 AND version = $3`,
      [taskId, ownerId, expectedVersion],
    );
    if (updated.rowCount !== 1) {
      throw new TaskConflictError("task version conflict");
    }
    await client.query(
      `UPDATE task_confirmations SET status = 'invalidated'
       WHERE task_id = $1 AND status = 'active'`,
      [taskId],
    );
    await client.query(
      `UPDATE task_runs SET status = 'completed', completed_at = now()
       WHERE run_id = $1`,
      [runId],
    );
    return this.loadSnapshot(client, ownerId, taskId);
  }

  async finishRun(
    client: PoolClient,
    ownerId: string,
    runId: string,
    status: "completed" | "failed" | "cancelled",
  ): Promise<void> {
    await client.query(
      `UPDATE task_runs SET status = $3, completed_at = now()
       WHERE run_id = $1 AND owner_id = $2 AND status = 'running'`,
      [runId, ownerId, status],
    );
  }

  async createConfirmation(
    client: PoolClient,
    ownerId: string,
    providerAccountId: string,
    taskId: string,
    expectedVersion: number,
    kind: ConfirmationKind,
    payload: unknown,
    expiresAt: Date,
  ): Promise<{ confirmationId: string; task: TaskSnapshot }> {
    if (!(expiresAt.getTime() > Date.now())) {
      throw new TaskConflictError("confirmation expiry is invalid");
    }
    const metadata = await client.query<{
      version: string;
      phase: TaskPhase;
      provider_account_id: string | null;
      binding_version: string | null;
      plan_id: string | null;
      plan_version: string | null;
    }>(
      `SELECT
        t.version, t.phase, t.provider_account_id,
        b.binding_version, p.plan_id, p.plan_version
       FROM tasks t
       LEFT JOIN task_address_bindings b ON b.task_id = t.task_id
       LEFT JOIN final_plans p
         ON p.task_id = t.task_id AND p.status = 'current'
       WHERE t.task_id = $1 AND t.owner_id = $2
       FOR UPDATE OF t`,
      [taskId, ownerId],
    );
    const row = metadata.rows[0];
    const expectedPhase: TaskPhase =
      kind === "cart"
        ? "awaiting_cart_confirmation"
        : "awaiting_order_confirmation";
    if (
      !row ||
      Number(row.version) !== expectedVersion ||
      row.phase !== expectedPhase ||
      row.provider_account_id !== providerAccountId ||
      !row.binding_version ||
      !row.plan_id ||
      !row.plan_version
    ) {
      throw new TaskConflictError("task cannot create this confirmation");
    }

    await client.query(
      `UPDATE task_confirmations SET status = 'invalidated'
       WHERE task_id = $1 AND kind = $2 AND status = 'active'`,
      [taskId, kind],
    );
    const confirmationId = crypto.randomUUID();
    const nextTaskVersion = expectedVersion + 1;
    const updated = await client.query(
      `UPDATE tasks SET version = version + 1, updated_at = now()
       WHERE task_id = $1 AND owner_id = $2 AND version = $3`,
      [taskId, ownerId, expectedVersion],
    );
    if (updated.rowCount !== 1) {
      throw new TaskConflictError("task version conflict");
    }
    await client.query(
      `INSERT INTO task_confirmations (
        confirmation_id, task_id, kind, task_version,
        plan_id, plan_version, binding_version,
        payload_hash, provider_payload, status, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9::jsonb, 'active', $10
      )`,
      [
        confirmationId,
        taskId,
        kind,
        nextTaskVersion,
        row.plan_id,
        Number(row.plan_version),
        Number(row.binding_version),
        payloadHash(payload),
        JSON.stringify(payload),
        expiresAt,
      ],
    );
    return {
      confirmationId,
      task: await this.loadSnapshot(client, ownerId, taskId),
    };
  }

  async consumeConfirmation(
    client: PoolClient,
    ownerId: string,
    providerAccountId: string,
    taskId: string,
    expectedVersion: number,
    confirmationId: string,
    kind: ConfirmationKind,
    decision: TaskDecision,
  ): Promise<{ task: TaskSnapshot; confirmation: StoredConfirmation }> {
    const current = await this.loadSnapshot(client, ownerId, taskId);
    const expectedPhase: TaskPhase =
      kind === "cart"
        ? "awaiting_cart_confirmation"
        : "awaiting_order_confirmation";
    if (
      current.version !== expectedVersion ||
      current.phase !== expectedPhase ||
      decision.next.phase === current.phase
    ) {
      throw new TaskConflictError("task cannot consume this confirmation");
    }
    const row = await client.query<{
      provider_account_id: string | null;
      binding_version: string | null;
      plan_id: string | null;
      plan_version: string | null;
    }>(
      `SELECT
        t.provider_account_id, b.binding_version,
        p.plan_id, p.plan_version
       FROM tasks t
       LEFT JOIN task_address_bindings b ON b.task_id = t.task_id
       LEFT JOIN final_plans p
         ON p.task_id = t.task_id AND p.status = 'current'
       WHERE t.task_id = $1 AND t.owner_id = $2
       FOR UPDATE OF t`,
      [taskId, ownerId],
    );
    const metadata = row.rows[0];
    if (
      !metadata ||
      metadata.provider_account_id !== providerAccountId ||
      !metadata.binding_version ||
      !metadata.plan_id ||
      !metadata.plan_version
    ) {
      throw new TaskConflictError("task provider state changed");
    }
    const confirmationResult = await client.query<ConfirmationRow>(
      `SELECT
        confirmation_id, kind, task_version, payload_hash,
        provider_payload, expires_at
       FROM task_confirmations
       WHERE confirmation_id = $1
         AND task_id = $2
         AND kind = $3
         AND task_version = $4
         AND plan_id = $5
         AND plan_version = $6
         AND binding_version = $7
         AND status = 'active'
         AND expires_at > now()
       FOR UPDATE`,
      [
        confirmationId,
        taskId,
        kind,
        expectedVersion,
        metadata.plan_id,
        Number(metadata.plan_version),
        Number(metadata.binding_version),
      ],
    );
    const confirmation = confirmationResult.rows[0];
    if (
      !confirmation ||
      payloadHash(confirmation.provider_payload) !== confirmation.payload_hash
    ) {
      throw new TaskConflictError("confirmation is stale or invalid");
    }
    await client.query(
      `UPDATE task_confirmations
       SET status = 'consumed', consumed_at = now()
       WHERE confirmation_id = $1`,
      [confirmationId],
    );
    const task = await this.applyDecision(
      client,
      ownerId,
      expectedVersion,
      decision,
    );
    return {
      task,
      confirmation: {
        confirmationId: confirmation.confirmation_id,
        kind: confirmation.kind,
        taskVersion: Number(confirmation.task_version),
        payloadHash: confirmation.payload_hash,
        payload: confirmation.provider_payload,
        expiresAt: confirmation.expires_at.toISOString(),
      },
    };
  }


  async assertProviderAccount(
    client: PoolClient,
    ownerId: string,
    providerAccountId: string,
    taskId: string,
  ): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM tasks
       WHERE task_id = $1
         AND owner_id = $2
         AND provider_account_id = $3
       FOR UPDATE`,
      [taskId, ownerId, providerAccountId],
    );
    if (result.rowCount !== 1) {
      throw new TaskConflictError("task provider account conflict");
    }
  }

}
