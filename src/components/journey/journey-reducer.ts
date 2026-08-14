import type { TaskPhase } from "../../domain/task-contract";
import type { JourneyEvent, JourneySnapshot, JourneyState } from "./types";

function gatedStateFor(phase: TaskPhase | undefined): JourneyState | null {
  switch (phase) {
    case "awaiting_login":
    case "awaiting_address":
    case "editing_plan":
    case "awaiting_cart_confirmation":
    case "awaiting_order_confirmation":
    case "awaiting_payment":
    case "blocked":
      return "awaiting_input";
    case "searching_catalog":
    case "writing_cart":
    case "creating_order":
      return "reasoning";
    case "completed":
      return "ready";
    default:
      return null;
  }
}

export const initialJourneySnapshot: JourneySnapshot = {
  state: "idle",
  activeRequestId: null,
  runId: null,
  task: null,
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

  if (event.requestId !== snapshot.activeRequestId) {
    return snapshot;
  }

  switch (event.type) {
    case "task.updated":
      return {
        ...snapshot,
        state: gatedStateFor(event.task.phase) ?? snapshot.state,
        task: event.task,
      };
    case "stream.started":
      return {
        ...snapshot,
        state: "reasoning",
        runId: event.runId,
        error: null,
      };
    case "presentation.updated": {
      const loginPhase =
        event.presentation.component === "pupu.login"
          ? event.presentation.payload.phase
          : null;
      const state = loginPhase
        ? (["phone", "captcha", "sms", "error"].includes(loginPhase)
            ? "awaiting_input"
            : "reasoning")
        : "assembling";
      return {
        ...snapshot,
        state: gatedStateFor(snapshot.task?.phase) ?? state,
        presentation: event.presentation,
      };
    }
    case "trace.updated":
      return {
        ...snapshot,
        state: gatedStateFor(snapshot.task?.phase) ?? "reasoning",
        trace: event.entries,
      };
    case "result.partial":
      return {
        ...snapshot,
        state: "assembling",
        partialResult: event.result,
      };
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
        presentation: snapshot.presentation,
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
