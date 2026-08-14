import type { TaskSnapshot } from "../../src/domain/task-contract";
import type { HermesRunEvent } from "../../src/ai/hermes-event-adapter";
import type {
  ToolArtifactIdentity,
  ToolArtifactReadResult,
} from "../tool-artifact";
import {
  taskProposalSchema,
  type TaskProposal,
} from "../tasks/task-proposal";

export interface TaskAgent {
  propose(command: {
    input: string;
    current?: TaskSnapshot;
    signal?: AbortSignal;
  }): Promise<TaskProposal>;
}

interface Dependencies {
  createRun: (
    input: string,
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<{ runId: string }>;
  streamRun: (
    runId: string,
    signal?: AbortSignal,
  ) => AsyncIterable<HermesRunEvent>;
  readToolArtifact: (
    identity: ToolArtifactIdentity,
  ) => Promise<ToolArtifactReadResult>;
  createId?: () => string;
}

function prompt(input: string, current?: TaskSnapshot): string {
  return [
    "You are the primary Task Agent.",
    "Interpret the user's goal, context changes, and capabilities needed.",
    "Call submit_task_proposal exactly once. Do not call any provider tool.",
    "The TaskCoordinator will decide stages, confirmations, and write permissions.",
    "",
    `User input: ${input}`,
    `Current TaskSnapshot: ${JSON.stringify(current ?? null)}`,
    "",
    "Use operation=start only when Current TaskSnapshot is null.",
    "Use research when the user wants new products, revise for quantity or constraint-only plan edits, otherwise continue.",
    "requirementsToAdd must contain only explicit user requirements.",
  ].join("\n");
}

function parseProposal(output: unknown): TaskProposal {
  let value = output;
  if (typeof value === "string") value = JSON.parse(value);
  if (!value || typeof value !== "object") {
    throw new Error("Task Agent returned an invalid proposal");
  }
  const data = (value as { data?: unknown }).data;
  const proposal =
    data && typeof data === "object"
      ? (data as { proposal?: unknown }).proposal
      : undefined;
  return taskProposalSchema.parse(proposal);
}

export class HermesTaskAgent implements TaskAgent {
  constructor(private readonly dependencies: Dependencies) {}

  async propose(command: {
    input: string;
    current?: TaskSnapshot;
    signal?: AbortSignal;
  }): Promise<TaskProposal> {
    const sessionId =
      this.dependencies.createId?.() ?? `task-route-${crypto.randomUUID()}`;
    const { runId } = await this.dependencies.createRun(
      prompt(command.input, command.current),
      sessionId,
      command.signal,
    );
    let sequence = 0;
    for await (const event of this.dependencies.streamRun(
      runId,
      command.signal,
    )) {
      if (event.type !== "tool.completed") continue;
      sequence += 1;
      if (event.tool_name !== "submit_task_proposal") {
        throw new Error("Task Agent called an unauthorized tool");
      }
      const artifact = await this.dependencies.readToolArtifact({
        sessionId,
        runId,
        toolCallId: event.tool_call_id,
        toolName: event.tool_name,
        sequence,
      });
      if (artifact.status !== "ok") {
        throw new Error("Task Agent proposal artifact is unavailable");
      }
      return parseProposal(artifact.result);
    }
    throw new Error("Task Agent did not submit a proposal");
  }
}
