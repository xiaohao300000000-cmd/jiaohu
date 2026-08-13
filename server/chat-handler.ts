import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  createHermesEventContext,
  mapHermesEvent,
  type HermesRunEvent,
} from "../src/ai/hermes-event-adapter";
import type { JourneyUIMessage } from "../src/ai/journey-ui-message";
import { getHermesConfig } from "./config";
import { createHermesRun, streamHermesRun } from "./hermes-client";
import {
  readToolArtifact,
  type ToolArtifactIdentity,
  type ToolArtifactReadResult,
} from "./tool-artifact";

interface ChatDependencies {
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
  preparePupuScope?: (request: Request, sessionId: string, input: string) => Promise<void>;
  cleanupPupuScope?: (sessionId: string) => Promise<void>;
  registerPupuPlan?: (sessionId: string, runId: string, products: import("../src/components/agent/agent-ui-event").ProductSummary[]) => void;
}

function isComplexMealRequest(input: string): boolean {
  return /(?:低脂|三道菜|营养全面|晚餐|做.*菜)/.test(input);
}
function hermesInput(input: string, pupuIntent: boolean): string {
  if (!pupuIntent) return input;
  if (!isComplexMealRequest(input)) {
    const cartRead = /购物车|购车/.test(input);
    return [
      input,
      "",
      "[LIQUIDJOURNEY_EXECUTION_CONTRACT]",
      "The browser has already completed Pupu login and delivery-address verification.",
      cartRead
        ? "Call pupu_read_cart exactly once."
        : "Call pupu_search_catalog exactly once using the product request above.",
      "Do not call pupu_auth_status or pupu_capabilities.",
      "After the tool result, answer only from the returned live data.",
    ].join("\n");
  }
  return [
    input,
    "",
    "[LIQUIDJOURNEY_EXECUTION_CONTRACT]",
    "This is a Pupu meal-shopping request.",
    "Call pupu_search_meal_catalog exactly once with queries for lean protein, vegetables, and tofu or another core ingredient.",
    "Do not call pupu_search_catalog, pupu_read_cart, pupu_auth_status, or pupu_capabilities.",
    "After the tool result, produce exactly three simple low-fat dishes grounded in returned in-stock SKUs, with nutrition coverage and substitutions.",
    "Never return a prose-only or zero-price plan.",
  ].join("\n");
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

  const requestedId =
    body !== null &&
    typeof body === "object" &&
    "requestId" in body &&
    typeof (body as { requestId: unknown }).requestId === "string"
      ? (body as { requestId: string }).requestId
      : null;
  const sessionId =
    requestedId && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(requestedId)
      ? requestedId
      : dependencies.createId?.() || `journey-${crypto.randomUUID()}`;
  const pupuIntent =
    body !== null &&
    typeof body === "object" &&
    "pupuIntent" in body &&
    (body as { pupuIntent?: unknown }).pupuIntent === true;
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
        if (pupuIntent && dependencies.preparePupuScope) {
          await dependencies.preparePupuScope(request, sessionId, input);
          scopePrepared = true;
        }
        const { runId } = await createRun(hermesInput(input, pupuIntent), sessionId, request.signal);
        writer.write({ type: "message-metadata", messageMetadata: { runId } });
        const context = createHermesEventContext(sessionId, input, runId);
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
          if (event.type === "run.completed" && dependencies.registerPupuPlan && context.products.length > 0) {
            dependencies.registerPupuPlan(sessionId, runId, context.products);
          }
          if (!mapped) continue;
          writer.write({ type: "data-journey", data: mapped });
        }
      } catch (error) {
        if (request.signal.aborted) return;
        throw error;
      }
      finally {
        if (scopePrepared && dependencies.cleanupPupuScope) {
          await dependencies.cleanupPupuScope(sessionId);
        }
      }
    },
    onError: () => "实时服务暂时不可用，请稍后重试。",
  });

  return createUIMessageStreamResponse({ stream });
}
