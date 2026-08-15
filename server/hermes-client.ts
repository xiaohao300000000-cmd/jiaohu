import type { HermesRunEvent } from "../src/ai/hermes-event-adapter";
import type { HermesClientConfig } from "./config";

export type { HermesClientConfig } from "./config";

type FetchLike = typeof fetch;
type ConversationMessage = { role: string; content: string };
type SessionHistory = {
  conversationHistory: ConversationMessage[];
  toolMessageCursor: number;
};

function headers(
  config: HermesClientConfig,
  sessionKey?: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(config.apiKey
      ? { authorization: `Bearer ${config.apiKey}` }
      : {}),
    ...(sessionKey ? { "X-Hermes-Session-Key": sessionKey } : {}),
  };
}

async function readSessionHistory(
  sessionId: string,
  sessionKey: string,
  config: HermesClientConfig,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<SessionHistory> {
  const response = await fetchImpl(
    `${config.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=500&order=oldest`,
    { headers: headers(config, sessionKey), signal },
  );
  if (response.status === 404) {
    return { conversationHistory: [], toolMessageCursor: 0 };
  }
  if (!response.ok) {
    throw new Error(`Hermes session history failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) {
    return { conversationHistory: [], toolMessageCursor: 0 };
  }
  let toolMessageCursor = 0;
  const conversationHistory = body.data.flatMap((message) => {
    if (
      message === null ||
      typeof message !== "object" ||
      typeof (message as { role?: unknown }).role !== "string" ||
      typeof (message as { content?: unknown }).content !== "string"
    ) return [];
    const messageId = (message as { id?: unknown }).id;
    if (typeof messageId === "number" && messageId > toolMessageCursor) {
      toolMessageCursor = messageId;
    }
    const { role, content } = message as ConversationMessage;
    return role === "user" || role === "assistant" ? [{ role, content }] : [];
  });
  return { conversationHistory, toolMessageCursor };
}

async function readNextToolMessage(
  sessionId: string,
  sessionKey: string,
  expectedToolName: string,
  cursor: number,
  consumedToolCallIds: Set<string>,
  config: HermesClientConfig,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<{ messageId: number; output: unknown }> {
  const response = await fetchImpl(
    `${config.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=500&order=oldest`,
    { headers: headers(config, sessionKey), signal },
  );
  if (!response.ok) {
    throw new Error(`Hermes tool message lookup failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: unknown };
  const messages = Array.isArray(body.data) ? body.data : [];
  const message = messages
    .flatMap((item) => {
      if (
        item === null ||
        typeof item !== "object" ||
        (item as { role?: unknown }).role !== "tool" ||
        typeof (item as { id?: unknown }).id !== "number" ||
        typeof (item as { tool_call_id?: unknown }).tool_call_id !== "string" ||
        typeof (item as { tool_name?: unknown }).tool_name !== "string" ||
        typeof (item as { content?: unknown }).content !== "string"
      ) return [];
      return [item as {
        id: number;
        tool_call_id: string;
        tool_name: string;
        content: string;
      }];
    })
    .filter((item) =>
      item.id > cursor && !consumedToolCallIds.has(item.tool_call_id)
    )
    .sort((left, right) => left.id - right.id)[0];
  if (!message) {
    throw new Error("Hermes tool result message is missing");
  }
  if (message.tool_name !== expectedToolName) {
    throw new Error(
      `Hermes tool result order mismatch: expected ${expectedToolName}, received ${message.tool_name}`,
    );
  }
  consumedToolCallIds.add(message.tool_call_id);
  let output: unknown = message.content;
  try {
    output = JSON.parse(message.content) as unknown;
  } catch {}
  return { messageId: message.id, output };
}

function opaqueReference(): string {
  return `hermes-event-${crypto.randomUUID()}`;
}

export async function createHermesRun(
  input: string,
  sessionId: string,
  sessionKey: string,
  config: HermesClientConfig,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<{ runId: string; toolMessageCursor: number }> {
  const { conversationHistory, toolMessageCursor } = await readSessionHistory(
    sessionId,
    sessionKey,
    config,
    fetchImpl,
    signal,
  );
  const response = await fetchImpl(`${config.baseUrl}/v1/runs`, {
    method: "POST",
    headers: headers(config, sessionKey),
    body: JSON.stringify({
      input,
      session_id: sessionId,
      conversation_history: conversationHistory,
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Hermes run creation failed (${response.status})`);
  }
  const body = (await response.json()) as { run_id?: unknown };
  if (typeof body.run_id !== "string" || !body.run_id) {
    throw new Error("Hermes returned an invalid run id");
  }
  return { runId: body.run_id, toolMessageCursor };
}

function normalizeEvent(
  eventName: string,
  payload: Record<string, unknown>,
  counters: Map<string, number>,
  activeCalls: Map<string, string>,
): HermesRunEvent | null {
  const runId =
    typeof payload.run_id === "string" ? payload.run_id : "unknown";
  switch (eventName) {
    case "run.started":
      return { type: "run.started", run_id: runId };
    case "tool.started": {
      const toolName =
        typeof payload.tool === "string" ? payload.tool : "unknown_tool";
      const count = (counters.get(toolName) || 0) + 1;
      counters.set(toolName, count);
      const callId = `${runId}:${toolName}:${count}`;
      activeCalls.set(toolName, callId);
      return {
        type: "tool.started",
        run_id: runId,
        tool_name: toolName,
        tool_call_id: callId,
      };
    }
    case "tool.completed": {
      const toolName =
        typeof payload.tool === "string" ? payload.tool : "unknown_tool";
      const callId =
        activeCalls.get(toolName) ||
        `${runId}:${toolName}:${counters.get(toolName) || 1}`;
      activeCalls.delete(toolName);
      return {
        type: "tool.completed",
        run_id: runId,
        tool_name: toolName,
        tool_call_id: callId,
        output: null,
      };
    }
    case "run.completed":
      return {
        type: "run.completed",
        run_id: runId,
        output: {
          summary:
            typeof payload.output === "string" ? payload.output : undefined,
        },
      };
    case "run.failed":
      return {
        type: "run.failed",
        run_id: runId,
        error: { reference: opaqueReference() },
      };
    case "run.cancelled":
      return { type: "run.cancelled", run_id: runId };
    default:
      return null;
  }
}

function parseFrame(
  frame: string,
  counters: Map<string, number>,
  activeCalls: Map<string, string>,
): HermesRunEvent | null {
  if (!frame.trim() || frame.trimStart().startsWith(":")) return null;
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    const resolvedEvent =
      eventName ||
      (typeof payload.event === "string" ? payload.event : "");
    return normalizeEvent(resolvedEvent, payload, counters, activeCalls);
  } catch {
    return {
      type: "run.failed",
      run_id: "unknown",
      error: {
        kind: "invalid_result",
        reference: opaqueReference(),
      },
    };
  }
}

export async function* parseHermesEventStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<HermesRunEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const counters = new Map<string, number>();
  const activeCalls = new Map<string, string>();
  let buffer = "";
  const abort = () => {
    void reader.cancel("aborted").catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const event = parseFrame(frame, counters, activeCalls);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseFrame(buffer, counters, activeCalls);
      if (event) yield event;
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export async function* streamHermesRun(
  runId: string,
  sessionId: string,
  sessionKey: string,
  toolMessageCursor: number,
  config: HermesClientConfig,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): AsyncGenerator<HermesRunEvent> {
  const response = await fetchImpl(
    `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`,
    { headers: headers(config, sessionKey), signal },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Hermes event stream failed (${response.status})`);
  }
  let cursor = toolMessageCursor;
  const consumedToolCallIds = new Set<string>();
  for await (const event of parseHermesEventStream(response.body, signal)) {
    if (event.type === "tool.completed") {
      const toolMessage = await readNextToolMessage(
        sessionId,
        sessionKey,
        event.tool_name,
        cursor,
        consumedToolCallIds,
        config,
        fetchImpl,
        signal,
      );
      cursor = toolMessage.messageId;
      yield event.tool_name === "pupu_cli"
        ? { ...event, output: toolMessage.output }
        : event;
    } else {
      yield event;
    }
  }
}

export async function stopHermesRun(
  runId: string,
  config: HermesClientConfig,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stop`,
    { method: "POST", headers: headers(config) },
  );
  if (!response.ok) {
    throw new Error(`Hermes stop failed (${response.status})`);
  }
}
