import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { TaskPhase, TaskSnapshot } from "../../src/domain/task-contract";
import { withTransaction } from "../db/transaction";
import { TaskConflictError, TaskCoordinator } from "./task-coordinator";
import {
  PostgresTaskRepository,
  type ConfirmationKind,
} from "./task-repository";
import {
  PostgresIdempotencyRepository,
  type IdempotencyInput,
} from "./idempotency-repository";

interface MutationCommand {
  ownerId: string;
  providerAccountId: string;
  operation: string;
  kind: ConfirmationKind;
  taskId: string;
  expectedVersion: number;
  confirmationId: string;
  idempotencyKey: string;
  enterPhase: TaskPhase;
}

function mutationRequestHash(command: MutationCommand): string {
  return createHash("sha256").update(JSON.stringify({
    operation: command.operation,
    kind: command.kind,
    taskId: command.taskId,
    expectedVersion: command.expectedVersion,
    confirmationId: command.confirmationId,
  })).digest("hex");
}

function idempotencyInput(command: MutationCommand): IdempotencyInput {
  return {
    accountId: command.providerAccountId,
    operation: command.operation,
    idempotencyKey: command.idempotencyKey,
    requestHash: mutationRequestHash(command),
    taskId: command.taskId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
  };
}

export class TaskApplicationService {
  constructor(
    private readonly pool: Pool,
    private readonly repository: PostgresTaskRepository,
    private readonly coordinator: TaskCoordinator,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly idempotency = new PostgresIdempotencyRepository(),
  ) {}

  resolve(command: {
    ownerId: string;
    input: string;
    taskId?: string;
    proposal: import("./task-proposal").TaskProposal;
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, async (client) => {
      if (!command.taskId) {
        const decision = this.coordinator.acceptNewTask(
          this.createId(),
          command.input,
          command.proposal,
        );
        return this.repository.create(
          client,
          command.ownerId,
          decision.next,
        );
      }

      const current = await this.repository.loadSnapshot(
        client,
        command.ownerId,
        command.taskId,
      );
      const decision = this.coordinator.acceptProposal(
        current,
        command.input,
        command.proposal,
      );
      return this.repository.applyDecision(
        client,
        command.ownerId,
        current.version,
        decision,
      );
    });
  }

  get(ownerId: string, taskId: string): Promise<TaskSnapshot> {
    return withTransaction(this.pool, (client) =>
      this.repository.loadSnapshot(client, ownerId, taskId));
  }

  transition(command: {
    ownerId: string;
    taskId: string;
    expectedVersion: number;
    phase: TaskPhase;
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, async (client) => {
      const current = await this.repository.loadSnapshot(
        client,
        command.ownerId,
        command.taskId,
      );
      if (current.version !== command.expectedVersion) {
        throw new TaskConflictError("task version conflict");
      }
      return this.repository.applyDecision(
        client,
        command.ownerId,
        command.expectedVersion,
        this.coordinator.transition(current, command.phase),
      );
    });
  }
  bindAddress(command: {
    ownerId: string;
    taskId: string;
    expectedVersion: number;
    providerAccountId: string;
    binding: import("../../src/domain/task-contract").TaskAddressBinding;
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, (client) =>
      this.repository.bindAddress(
        client,
        command.ownerId,
        command.taskId,
        command.expectedVersion,
        command.providerAccountId,
        command.binding,
      ));
  }
  startRun(command: {
    ownerId: string;
    taskId: string;
    taskVersion: number;
    runId: string;
  }): Promise<void> {
    return withTransaction(this.pool, (client) =>
      this.repository.startRun(
        client,
        command.ownerId,
        command.taskId,
        command.taskVersion,
        command.runId,
      ));
  }

  storeCandidates(command: {
    ownerId: string;
    taskId: string;
    taskVersion: number;
    runId: string;
    toolCallId: string;
    candidates: import("./task-repository").CandidateInput[];
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, (client) =>
      this.repository.storeCandidates(
        client,
        command.ownerId,
        command.taskId,
        command.taskVersion,
        command.runId,
        command.toolCallId,
        command.candidates,
      ));
  }

  submitFinalPlan(command: {
    ownerId: string;
    taskId: string;
    expectedVersion: number;
    runId: string;
    mode: "search" | "quantity_revision";
    input: import("./final-plan").SubmitFinalPlanInput;
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, (client) =>
      this.repository.submitFinalPlan(
        client,
        command.ownerId,
        command.taskId,
        command.expectedVersion,
        command.runId,
        command.mode,
        command.input,
      ));
  }

  finishRun(command: {
    ownerId: string;
    runId: string;
    status: "completed" | "failed" | "cancelled";
  }): Promise<void> {
    return withTransaction(this.pool, (client) =>
      this.repository.finishRun(
        client,
        command.ownerId,
        command.runId,
        command.status,
      ));
  }

  createConfirmation(command: {
    ownerId: string;
    providerAccountId: string;
    taskId: string;
    expectedVersion: number;
    kind: ConfirmationKind;
    payload: unknown;
    expiresAt: Date;
  }): Promise<{ confirmationId: string; task: TaskSnapshot }> {
    return withTransaction(this.pool, (client) =>
      this.repository.createConfirmation(
        client,
        command.ownerId,
        command.providerAccountId,
        command.taskId,
        command.expectedVersion,
        command.kind,
        command.payload,
        command.expiresAt,
      ));
  }

  acquireMutation(command: MutationCommand): Promise<
    | { kind: "replay"; result: unknown }
    | { kind: "in_progress" }
    | { kind: "acquired"; task: TaskSnapshot; payload: unknown }
  > {
    return withTransaction(this.pool, async (client) => {
      const acquired = await this.idempotency.acquire(
        client,
        idempotencyInput(command),
      );
      if (acquired.kind !== "acquired") return acquired;

      const current = await this.repository.loadSnapshot(
        client,
        command.ownerId,
        command.taskId,
      );
      if (current.version !== command.expectedVersion) {
        throw new TaskConflictError("task version conflict");
      }
      const consumed = await this.repository.consumeConfirmation(
        client,
        command.ownerId,
        command.providerAccountId,
        command.taskId,
        command.expectedVersion,
        command.confirmationId,
        command.kind,
        this.coordinator.transition(current, command.enterPhase),
      );
      return {
        kind: "acquired",
        task: consumed.task,
        payload: consumed.confirmation.payload,
      };
    });
  }

  completeMutation(command: MutationCommand & {
    expectedCurrentVersion: number;
    nextPhase: TaskPhase;
    providerResult: object;
  }): Promise<object & { task: TaskSnapshot }> {
    return withTransaction(this.pool, async (client) => {
      const current = await this.repository.loadSnapshot(
        client,
        command.ownerId,
        command.taskId,
      );
      if (
        current.version !== command.expectedCurrentVersion ||
        current.phase !== command.enterPhase
      ) {
        throw new TaskConflictError("task mutation completion conflict");
      }
      const task = await this.repository.applyDecision(
        client,
        command.ownerId,
        command.expectedCurrentVersion,
        this.coordinator.transition(current, command.nextPhase),
      );
      const result = { ...command.providerResult, task };
      await this.idempotency.succeed(
        client,
        idempotencyInput(command),
        result,
      );
      return result;
    });
  }

  failMutation(command: MutationCommand & {
    expectedCurrentVersion: number;
    errorCode: string;
  }): Promise<void> {
    return withTransaction(this.pool, async (client) => {
      await this.idempotency.fail(
        client,
        idempotencyInput(command),
        command.errorCode,
      );
      const current = await this.repository.loadSnapshot(
        client,
        command.ownerId,
        command.taskId,
      );
      if (
        current.version === command.expectedCurrentVersion &&
        current.phase === command.enterPhase
      ) {
        await this.repository.applyDecision(
          client,
          command.ownerId,
          command.expectedCurrentVersion,
          this.coordinator.transition(current, "blocked"),
        );
      }
    });
  }


  requirePhase(command: {
    ownerId: string;
    providerAccountId: string;
    taskId: string;
    expectedVersion: number;
    phase: TaskPhase;
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, async (client) => {
      await this.repository.assertProviderAccount(
        client,
        command.ownerId,
        command.providerAccountId,
        command.taskId,
      );
      const task = await this.repository.loadSnapshot(
        client,
        command.ownerId,
        command.taskId,
      );
      if (task.version !== command.expectedVersion) {
        throw new TaskConflictError("task version conflict");
      }
      return this.coordinator.assertPhase(task, command.phase);
    });
  }

}
