import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  createHermesEventContext,
  mapHermesEvent,
  type HermesRunEvent,
} from "../src/ai/hermes-event-adapter";
import type { JourneyUIMessage } from "../src/ai/journey-ui-message";
import { getHermesConfig } from "./config";
import { createHermesRun, streamHermesRun } from "./hermes-client";

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
  createId?: () => string;
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

  const config = getHermesConfig();
  const createRun =
    dependencies.createRun ||
    ((text: string, id: string, signal?: AbortSignal) =>
      createHermesRun(text, id, config, fetch, signal));
  const streamRun =
    dependencies.streamRun ||
    ((runId: string, signal?: AbortSignal) =>
      streamHermesRun(runId, config, signal));

  const stream = createUIMessageStream<JourneyUIMessage>({
    execute: async ({ writer }) => {
      const { runId } = await createRun(input, sessionId, request.signal);
      writer.write({ type: "message-metadata", messageMetadata: { runId } });
      const context = createHermesEventContext(sessionId, input, runId);
      const started = mapHermesEvent(
        { type: "run.started", run_id: runId },
        context,
      );
      if (started) writer.write({ type: "data-journey", data: started });

      for await (const event of streamRun(runId, request.signal)) {
        const mapped = mapHermesEvent(event, context);
        if (mapped) writer.write({ type: "data-journey", data: mapped });
      }
    },
    onError: () => "实时服务暂时不可用，请稍后重试。",
  });

  return createUIMessageStreamResponse({ stream });
}
