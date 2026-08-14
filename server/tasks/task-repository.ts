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
  people_count: number | null;
  budget_cents: number | null;
  dietary_requirements: unknown;
  requirements: unknown;
  requested_capabilities: unknown;
  receiver_id: string | null;
  store_id: string | null;
  place_id: string | null;
  place_zip: number | null;
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
        t.people_count, t.budget_cents, t.dietary_requirements,
        t.requirements, t.requested_capabilities,
        b.receiver_id, b.store_id, b.place_id, b.place_zip,
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
        updated_at = now()
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
}
