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
import { submitFinalPlanSchema } from "./tasks/final-plan";
import { TaskConflictError } from "./tasks/task-coordinator";
import type { TaskApplicationService } from "./tasks/task-application-service";
import {
  readToolArtifact,
  type ToolArtifactIdentity,
  type ToolArtifactReadResult,
} from "./tool-artifact";

export type PupuReadiness = "ready" | "awaiting_login" | "awaiting_address";

interface ChatDependencies {
  taskService?: Pick<TaskApplicationService, "resolve" | "get" | "transition"> & {
    startRun?: TaskApplicationService["startRun"];
    storeCandidates?: TaskApplicationService["storeCandidates"];
    submitFinalPlan?: TaskApplicationService["submitFinalPlan"];
    finishRun?: TaskApplicationService["finishRun"];
  };
  ownerId?: string;
  getPupuReadiness?: (request: Request, task: TaskSnapshot) => Promise<PupuReadiness>;
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
}


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

function finalPlanInput(output: unknown) {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const plan = (data as { plan?: unknown }).plan;
  if (!plan || typeof plan !== "object") return null;
  const raw = plan as {
    title?: unknown;
    explanation?: unknown;
    items?: unknown;
  };
  if (!Array.isArray(raw.items)) return null;
  return submitFinalPlanSchema.safeParse({
    title: raw.title,
    explanation: raw.explanation,
    items: raw.items.map((item) => {
      const entry = item as Record<string, unknown>;
      return {
        candidateId: entry.candidate_id,
        quantity: entry.quantity,
      };
    }),
  });
}

function taskCandidates(products: ProductSummary[]) {
  return products.map((product) => {
    if (!product.candidateId) {
      throw new TaskConflictError("candidate identity is missing");
    }
    return {
      candidateId: product.candidateId,
      storeProductId: product.productId,
      providerProductId: product.providerProductId,
      name: product.name,
      specification: product.specification,
      unitPriceCents: Math.round(product.unitPrice * 100),
      inStock: product.stockStatus !== "out_of_stock",
      collectedAt: product.collectedAt,
    };
  });
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
  if (!dependencies.taskService) {
    throw new Error("taskService is required");
  }
  const taskService = dependencies.taskService;
  const ownerId = dependencies.ownerId ?? "test-owner";
  const taskId = stringField(body, "taskId");
  let task: TaskSnapshot;
  try {
    task = booleanField(body, "resume") && taskId
      ? await taskService.get(ownerId, taskId)
      : await taskService.resolve({ ownerId, input, taskId });
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
          const readiness = await (dependencies.getPupuReadiness?.(request, task) ?? Promise.resolve("ready"));
          if (readiness === "ready" &&
              (task.phase === "awaiting_login" || task.phase === "awaiting_address")) {
            task = await taskService.transition({ ownerId, taskId: task.taskId, expectedVersion: task.version, phase: "searching_catalog" });
          } else if (readiness !== "ready" && task.phase !== readiness) {
            task = await taskService.transition({ ownerId, taskId: task.taskId, expectedVersion: task.version, phase: readiness });
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
        await taskService.startRun?.({
          ownerId, taskId: task.taskId, taskVersion: task.version, runId,
        });
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
            (sourceEvent.tool_name.startsWith("pupu_") ||
              sourceEvent.tool_name === "submit_final_plan")
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
            event.type === "tool.completed" &&
            (
              event.tool_name === "pupu_search_catalog" ||
              event.tool_name === "pupu_search_meal_catalog"
            ) &&
            taskService.storeCandidates
          ) {
            task = await taskService.storeCandidates({
              ownerId,
              taskId: task.taskId,
              taskVersion: task.version,
              runId,
              toolCallId: event.tool_call_id,
              candidates: taskCandidates(context.products),
            });
          }
          if (
            event.type === "tool.completed" &&
            event.tool_name === "submit_final_plan" &&
            taskService.submitFinalPlan
          ) {
            const parsed = finalPlanInput(event.output);
            if (!parsed?.success) {
              throw new TaskConflictError("invalid structured final plan");
            }
            task = await taskService.submitFinalPlan({
              ownerId,
              taskId: task.taskId,
              expectedVersion: task.version,
              runId,
              mode:
                task.phase === "editing_plan"
                  ? "quantity_revision"
                  : "search",
              input: parsed.data,
            });
            writer.write({
              type: "data-journey",
              data: { type: "task.updated", requestId: sessionId, task },
            });
          }
          if (
            event.type === "run.completed" &&
            taskService.submitFinalPlan &&
            task.allowedCapabilities.includes("task.plan.submit") &&
            !task.finalPlan
          ) {
            await taskService.finishRun?.({
              ownerId,
              runId,
              status: "failed",
            });
            writer.write({
              type: "data-journey",
              data: {
                type: "stream.failed",
                requestId: sessionId,
                error: {
                  kind: "invalid_result",
                  message: "Hermes 未提交结构化商品方案。",
                },
              },
            });
            continue;
          }
          if (event.type === "run.completed") {
            await taskService.finishRun?.({
              ownerId,
              runId,
              status: "completed",
            });
          } else if (event.type === "run.failed") {
            await taskService.finishRun?.({ ownerId, runId, status: "failed" });
          } else if (event.type === "run.cancelled") {
            await taskService.finishRun?.({ ownerId, runId, status: "cancelled" });
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
