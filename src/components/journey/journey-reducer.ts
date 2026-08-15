import type { JourneyEvent, JourneySnapshot } from "./types";

export const initialJourneySnapshot: JourneySnapshot = {
  state: "idle",
  activeRequestId: null,
  runId: null,
  requestText: "",
  trace: [],
  partialResult: null,
  result: null,
  presentation: null,
  awaitingInput: null,
  error: null,
  replacementRequestId: null,
};

function startsRequest(
  snapshot: JourneySnapshot,
  requestId: string,
  text: string,
): JourneySnapshot {
  return {
    ...snapshot,
    state: "receiving",
    activeRequestId: requestId,
    runId: null,
    requestText: text,
    trace: [],
    partialResult: null,
    result: null,
    presentation: null,
    awaitingInput: null,
    error: null,
    replacementRequestId: null,
  };
}

export function journeyReducer(
  snapshot: JourneySnapshot,
  event: JourneyEvent,
): JourneySnapshot {
  if (event.type === "request.sent") {
    return startsRequest(snapshot, event.requestId, event.text);
  }
  if (event.type === "retry.requested") {
    return startsRequest(snapshot, event.requestId, snapshot.requestText);
  }
  if (event.requestId !== snapshot.activeRequestId) return snapshot;

  switch (event.type) {
    case "stream.started":
      return { ...snapshot, state: "reasoning", runId: event.runId, error: null };
    case "presentation.updated":
      return { ...snapshot, state: "assembling", presentation: event.presentation };
    case "trace.updated":
      return { ...snapshot, state: "reasoning", trace: event.entries };
    case "result.partial":
      return { ...snapshot, state: "assembling", partialResult: event.result };
    case "approval.requested":
      return {
        ...snapshot,
        state: "awaiting_input",
        awaitingInput: event.input,
        error: null,
      };
    case "approval.responded":
      return {
        ...snapshot,
        state: "reasoning",
        awaitingInput: null,
      };
    case "stream.finished":
      return {
        ...snapshot,
        state: "ready",
        result: event.result,
        partialResult: event.result,
        awaitingInput: null,
        error: null,
      };
    case "stream.failed":
      return {
        ...snapshot,
        state: "error",
        error: event.error,
        awaitingInput: null,
        presentation: null,
      };
    case "stream.interrupted":
      return {
        ...snapshot,
        state: "interrupted",
        replacementRequestId: event.replacementRequestId ?? null,
        presentation: null,
      };
  }
}
