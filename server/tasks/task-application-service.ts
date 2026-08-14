import type { Pool } from "pg";
import type { TaskPhase, TaskSnapshot } from "../../src/domain/task-contract";
import { withTransaction } from "../db/transaction";
import { TaskConflictError, TaskCoordinator } from "./task-coordinator";
import { PostgresTaskRepository } from "./task-repository";

export class TaskApplicationService {
  constructor(
    private readonly pool: Pool,
    private readonly repository: PostgresTaskRepository,
    private readonly coordinator: TaskCoordinator,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  resolve(command: {
    ownerId: string;
    input: string;
    taskId?: string;
  }): Promise<TaskSnapshot> {
    return withTransaction(this.pool, async (client) => {
      if (!command.taskId) {
        const decision = this.coordinator.resolveNewTask(
          this.createId(),
          command.input,
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
      const decision = this.coordinator.resolveContinuation(
        current,
        command.input,
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
}
