import type { HermesRunEvent } from "../src/ai/hermes-event-adapter";
import type { HermesClientConfig } from "./config";

export type { HermesClientConfig } from "./config";

type FetchLike = typeof fetch;

function headers(config: HermesClientConfig): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(config.apiKey
      ? { authorization: `Bearer ${config.apiKey}` }
      : {}),
  };
}

function opaqueReference(): string {
  return `hermes-event-${crypto.randomUUID()}`;
}

export async function createHermesRun(
  input: string,
  sessionId: string,
  config: HermesClientConfig,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<{ runId: string }> {
  const response = await fetchImpl(`${config.baseUrl}/v1/runs`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ input, session_id: sessionId }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Hermes run creation failed (${response.status})`);
  }
  const body = (await response.json()) as { run_id?: unknown };
  if (typeof body.run_id !== "string" || !body.run_id) {
    throw new Error("Hermes returned an invalid run id");
  }
  return { runId: body.run_id };
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
    void reader.cancel("aborted");
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
  config: HermesClientConfig,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): AsyncGenerator<HermesRunEvent> {
  const response = await fetchImpl(
    `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`,
    { headers: headers(config), signal },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Hermes event stream failed (${response.status})`);
  }
  yield* parseHermesEventStream(response.body, signal);
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
