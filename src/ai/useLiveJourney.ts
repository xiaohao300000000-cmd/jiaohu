import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useMemo, useReducer, useRef } from "react";
import {
  initialJourneySnapshot,
  journeyReducer,
} from "../components/journey/journey-reducer";
import type {
  JourneyEvent,
  JourneySnapshot,
} from "../components/journey/types";
import type { JourneyUIMessage } from "./journey-ui-message";

interface UseLiveJourneyOptions {
  fetch?: typeof fetch;
}

type LiveReducerAction =
  { kind: "event"; event: JourneyEvent } | { kind: "reset" };

function liveReducer(
  snapshot: JourneySnapshot,
  action: LiveReducerAction,
): JourneySnapshot {
  return action.kind === "reset"
    ? initialJourneySnapshot
    : journeyReducer(snapshot, action.event);
}

function nextRequestId(): string {
  return `journey-${crypto.randomUUID()}`;
}

export function useLiveJourney(options: UseLiveJourneyOptions = {}) {
  const [snapshot, reduce] = useReducer(liveReducer, initialJourneySnapshot);
  const activeRequestId = useRef<string | null>(null);
  const activeText = useRef("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport<JourneyUIMessage>({
        api: "/api/chat",
        fetch: options.fetch,
      }),
    [options.fetch],
  );

  const dispatch = useCallback((event: JourneyEvent) => {
    reduce({ kind: "event", event });
  }, []);

  const chat = useChat<JourneyUIMessage>({
    transport,
    onData(part) {
      if (part.type === "data-journey") {
        dispatch(part.data);
      }
    },
    onError() {
      const requestId = activeRequestId.current;
      if (!requestId) return;
      dispatch({
        type: "stream.failed",
        requestId,
        error: {
          kind: "provider",
          message: "实时服务暂时不可用，请稍后重试。",
        },
      });
    },
  });

  const submit = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;
      if (chat.status === "submitted" || chat.status === "streaming") {
        await chat.stop();
      }
      const requestId = nextRequestId();
      activeRequestId.current = requestId;
      activeText.current = normalized;
      dispatch({ type: "request.sent", requestId, text: normalized });
      try {
        await chat.sendMessage({ text: normalized }, { body: { requestId } });
      } catch {
        dispatch({
          type: "stream.failed",
          requestId,
          error: {
            kind: "provider",
            message: "实时服务暂时不可用，请稍后重试。",
          },
        });
      }
    },
    [chat, dispatch],
  );

  const stop = useCallback(async () => {
    await chat.stop();
    if (snapshot.runId) {
      try {
        await (options.fetch || fetch)(
          `/api/runs/${encodeURIComponent(snapshot.runId)}/stop`,
          { method: "POST" },
        );
      } catch {
        // The local interruption still completes even if Hermes is unreachable.
      }
    }
    const requestId = activeRequestId.current;
    if (requestId) {
      dispatch({ type: "stream.interrupted", requestId });
    }
  }, [chat, dispatch, options.fetch, snapshot.runId]);

  const retry = useCallback(async () => {
    if (activeText.current) await submit(activeText.current);
  }, [submit]);

  const reset = useCallback(() => {
    chat.setMessages([]);
    chat.clearError();
    activeRequestId.current = null;
    activeText.current = "";
    reduce({ kind: "reset" });
  }, [chat]);

  const transportBusy =
    chat.status === "submitted" || chat.status === "streaming";

  return {
    snapshot,
    transportBusy,
    submit,
    stop,
    retry,
    reset,
  };
}
