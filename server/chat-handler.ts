import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  createHermesEventContext,
  mapHermesEvent,
  type HermesRunEvent,
} from "../src/ai/hermes-event-adapter";
import type { JourneyUIMessage } from "../src/ai/journey-ui-message";
import type { ProductSummary } from "../src/components/agent/agent-ui-event";
import type { JourneyPresentation } from "../src/components/journey/types";
import type { TaskSnapshot } from "../src/domain/task-contract";
import { getHermesConfig } from "./config";
import { createHermesRun, streamHermesRun } from "./hermes-client";
import { buildHermesTaskContract } from "./tasks/hermes-task-contract";
import { TaskConflictError, TaskCoordinator } from "./tasks/task-coordinator";
import {
  readToolArtifact,
  type ToolArtifactIdentity,
  type ToolArtifactReadResult,
} from "./tool-artifact";

export type PupuReadiness = "ready" | "awaiting_login" | "awaiting_address";

interface ChatDependencies {
  taskCoordinator?: TaskCoordinator;
  getPupuReadiness?: (request: Request) => Promise<PupuReadiness>;
  createRun?: (
    input: string,
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<{ runId: string }>;
  streamRun?: (
    runId: string,
    signal?: AbortSignal,
  ) => AsyncIterable<HermesRunEvent>;
  readToolArtifact?: (
    identity: ToolArtifactIdentity,
  ) => Promise<ToolArtifactReadResult>;
  createId?: () => string;
  preparePupuScope?: (
    request: Request,
    sessionId: string,
    task: TaskSnapshot,
  ) => Promise<void>;
  cleanupPupuScope?: (sessionId: string) => Promise<void>;
  registerPupuPlan?: (
    sessionId: string,
    runId: string,
    products: ProductSummary[],
    task: TaskSnapshot,
  ) => void | Promise<void>;
}

const defaultTaskCoordinator = new TaskCoordinator();

function extractInput(body: unknown): string | null {
  if (
    body === null ||
    typeof body !== "object" ||
    !("messages" in body) ||
    !Array.isArray((body as { messages: unknown }).messages)
  ) {
    return null;
  }
  const messages = (body as { messages: unknown[] }).messages;
  const message = [...messages]
    .reverse()
    .find(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        (item as { role?: unknown }).role === "user",
    ) as { parts?: unknown } | undefined;
  if (!message || !Array.isArray(message.parts)) return null;
  const text = message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part !== null &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text || null;
}

function stringField(body: unknown, field: string): string | undefined {
  if (
    body !== null &&
    typeof body === "object" &&
    field in body &&
    typeof (body as Record<string, unknown>)[field] === "string"
  ) {
    const value = (body as Record<string, string>)[field].trim();
    return value || undefined;
  }
  return undefined;
}

function booleanField(body: unknown, field: string): boolean {
  return Boolean(
    body !== null &&
      typeof body === "object" &&
      field in body &&
      (body as Record<string, unknown>)[field] === true,
  );
}

function needsPupu(task: TaskSnapshot): boolean {
  return task.domain === "commerce" && task.requestedCapabilities.some(
    (capability) =>
      capability === "commerce.catalog.search" ||
      capability === "commerce.catalog.meal-search" ||
      capability === "commerce.cart.read",
  );
}

function readinessPresentation(readiness: Exclude<PupuReadiness, "ready">): JourneyPresentation {
  if (readiness === "awaiting_login") {
    return {
      capability: "pupu",
      component: "pupu.login",
      mode: "anchored",
      dataSource: "live",
      payload: { phase: "phone" },
    };
  }
  return {
    capability: "pupu",
    component: "pupu.address",
    mode: "anchored",
    dataSource: "live",
    payload: { phase: "loading", addresses: [] },
  };
}

function taskProducts(products: ProductSummary[]) {
  return products.map((product) => ({
    productId: product.productId,
    providerProductId: product.providerProductId,
    name: product.name,
    quantity: product.quantity,
    unitPriceCents: Math.round(product.unitPrice * 100),
    source: "pupu_live" as const,
  }));
}

export async function handleChatRequest(
  request: Request,
  dependencies: ChatDependencies = {},
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const input = extractInput(body);
  if (!input) {
    return Response.json(
      { error: { code: "invalid_request", message: "请输入任务内容。" } },
      { status: 400 },
    );
  }

  const requestedId = stringField(body, "requestId");
  const sessionId =
    requestedId && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(requestedId)
      ? requestedId
      : dependencies.createId?.() || `journey-${crypto.randomUUID()}`;
  const taskCoordinator = dependencies.taskCoordinator ?? defaultTaskCoordinator;
  const taskId = stringField(body, "taskId");
  let task: TaskSnapshot;
  try {
    task = booleanField(body, "resume") && taskId
      ? taskCoordinator.resume(taskId)
      : taskCoordinator.resolve({ input, taskId });
  } catch (error) {
    if (error instanceof TaskConflictError) {
      return Response.json(
        { error: { code: "task_conflict", message: error.message } },
        { status: 409 },
      );
    }
    throw error;
  }

  const config = getHermesConfig();
  const createRun =
    dependencies.createRun ||
    ((text: string, id: string, signal?: AbortSignal) =>
      createHermesRun(text, id, config, fetch, signal));
  const streamRun =
    dependencies.streamRun ||
    ((runId: string, signal?: AbortSignal) =>
      streamHermesRun(runId, config, signal));
  const artifactReader = dependencies.readToolArtifact || readToolArtifact;

  const stream = createUIMessageStream<JourneyUIMessage>({
    execute: async ({ writer }) => {
      let scopePrepared = false;
      try {
        if (needsPupu(task)) {
          const readiness = await (dependencies.getPupuReadiness?.(request) ?? Promise.resolve("ready"));
          if (readiness === "ready" &&
              (task.phase === "awaiting_login" || task.phase === "awaiting_address")) {
            task = taskCoordinator.transition(task.taskId, task.version, "searching_catalog");
          } else if (readiness !== "ready" && task.phase !== readiness) {
            task = taskCoordinator.transition(task.taskId, task.version, readiness);
          }
          writer.write({
            type: "data-journey",
            data: { type: "task.updated", requestId: sessionId, task },
          });
          if (readiness !== "ready") {
            writer.write({
              type: "data-journey",
              data: {
                type: "presentation.updated",
                requestId: sessionId,
                presentation: readinessPresentation(readiness),
              },
            });
            return;
          }
          if (dependencies.preparePupuScope) {
            await dependencies.preparePupuScope(request, sessionId, task);
            scopePrepared = true;
          }
        } else {
          writer.write({
            type: "data-journey",
            data: { type: "task.updated", requestId: sessionId, task },
          });
        }

        const { runId } = await createRun(
          buildHermesTaskContract(task),
          sessionId,
          request.signal,
        );
        writer.write({ type: "message-metadata", messageMetadata: { runId } });
        const context = createHermesEventContext(sessionId, task.requestText, runId);
        const started = mapHermesEvent(
          { type: "run.started", run_id: runId },
          context,
        );
        if (started) writer.write({ type: "data-journey", data: started });

        let toolSequence = 0;
        for await (const sourceEvent of streamRun(runId, request.signal)) {
          let event = sourceEvent;
          if (
            sourceEvent.type === "tool.completed" &&
            sourceEvent.tool_name.startsWith("pupu_")
          ) {
            toolSequence += 1;
            const artifact = await artifactReader({
              sessionId,
              runId,
              toolCallId: sourceEvent.tool_call_id,
              toolName: sourceEvent.tool_name,
              sequence: toolSequence,
            });
            event = {
              ...sourceEvent,
              output:
                artifact.status === "ok"
                  ? artifact.result
                  : {
                      kind: "invalid_result",
                      artifactStatus: artifact.status,
                    },
            };
          }
          const mapped = mapHermesEvent(event, context);
          if (
            event.type === "run.completed" &&
            context.products.length > 0 &&
            task.allowedCapabilities.some((capability) =>
              capability === "commerce.catalog.search" ||
              capability === "commerce.catalog.meal-search")
          ) {
            task = taskCoordinator.attachProducts(
              task.taskId,
              task.version,
              taskProducts(context.products),
            );
            writer.write({
              type: "data-journey",
              data: { type: "task.updated", requestId: sessionId, task },
            });
            await dependencies.registerPupuPlan?.(
              sessionId,
              runId,
              context.products,
              task,
            );
          }
          if (!mapped) continue;
          writer.write({ type: "data-journey", data: mapped });
        }
      } catch (error) {
        if (request.signal.aborted) return;
        throw error;
      } finally {
        if (scopePrepared && dependencies.cleanupPupuScope) {
          await dependencies.cleanupPupuScope(sessionId);
        }
      }
    },
    onError: () => "实时服务暂时不可用，请稍后重试。",
  });

  return createUIMessageStreamResponse({ stream });
}
