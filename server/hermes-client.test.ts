import { describe, expect, it, vi } from "vitest";
import {
  createHermesRun,
  parseHermesEventStream,
  type HermesClientConfig,
} from "./hermes-client";

const encoder = new TextEncoder();

function chunkedStream(chunks: string[], onCancel?: () => void) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("Hermes client", () => {
  it("creates a run with a server-only bearer token and session", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ run_id: "run-1", status: "started" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    const config: HermesClientConfig = {
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "server-secret",
    };

    const result = await createHermesRun(
      "找牛奶",
      "session-1",
      config,
      fetchMock,
    );

    expect(result).toEqual({ runId: "run-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8642/v1/runs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer server-secret",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          input: "找牛奶",
          session_id: "session-1",
        }),
      }),
    );
  });

  it("reconstructs split SSE frames and ignores comments", async () => {
    const stream = chunkedStream([
      ": keep",
      "alive\n\nevent: tool.started\ndata: {\"run_id\":\"run-1\",",
      "\"tool\":\"pupu_search_catalog\"}\n\n",
      "event: run.completed\ndata: {\"run_id\":\"run-1\",\"output\":\"done\"}\n\n",
    ]);

    const events = [];
    for await (const event of parseHermesEventStream(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "tool.started",
        run_id: "run-1",
        tool_name: "pupu_search_catalog",
        tool_call_id: "run-1:pupu_search_catalog:1",
      },
      {
        type: "run.completed",
        run_id: "run-1",
        output: { summary: "done" },
      },
    ]);
  });

  it("maps malformed JSON to invalid_result", async () => {
    const stream = chunkedStream([
      "event: tool.completed\ndata: {broken}\n\n",
    ]);

    const events = [];
    for await (const event of parseHermesEventStream(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "run.failed",
        run_id: "unknown",
        error: {
          kind: "invalid_result",
          reference: expect.stringMatching(/^hermes-event-/),
        },
      },
    ]);
  });

  it("cancels the stream reader when aborted", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const iterator = parseHermesEventStream(
      stream,
      controller.signal,
    )[Symbol.asyncIterator]();

    const pending = iterator.next();
    controller.abort();
    await pending;

    expect(cancelled).toBe(true);
  });
});
