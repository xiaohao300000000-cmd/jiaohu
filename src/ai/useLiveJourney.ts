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
  | { kind: "event"; event: JourneyEvent }
  | { kind: "reset" };

function liveReducer(
  snapshot: JourneySnapshot,
  action: LiveReducerAction,
): JourneySnapshot {
  return action.kind === "reset"
    ? initialJourneySnapshot
    : journeyReducer(snapshot, action.event);
}

const SESSION_KEY_STORAGE = "pupu-hermes-session-key";

function nextRequestId(): string {
  return `journey-${crypto.randomUUID()}`;
}

function nextSessionId(): string {
  return `hermes-${crypto.randomUUID()}`;
}

function getOrCreateSessionKey(): string {
  const existing = localStorage.getItem(SESSION_KEY_STORAGE);
  if (existing) return existing;
  const created = `user-${crypto.randomUUID()}`;
  localStorage.setItem(SESSION_KEY_STORAGE, created);
  return created;
}

export function useLiveJourney(options: UseLiveJourneyOptions = {}) {
  const [snapshot, reduce] = useReducer(liveReducer, initialJourneySnapshot);
  const activeRequestId = useRef<string | null>(null);
  const activeText = useRef("");
  const sessionId = useRef(nextSessionId());
  const sessionKey = useRef(getOrCreateSessionKey());
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
      if (part.type === "data-journey") dispatch(part.data);
    },
    onError() {
      const requestId = activeRequestId.current;
      if (!requestId) return;
      dispatch({
        type: "stream.failed",
        requestId,
        error: {
          kind: "provider",
          message: "Hermes 暂时不可用，请稍后重试。",
        },
      });
    },
  });

  const submit = useCallback(async (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    if (chat.status === "submitted" || chat.status === "streaming") {
      await chat.stop();
    }
    const requestId = nextRequestId();
    activeRequestId.current = requestId;
    activeText.current = normalized;
    dispatch({ type: "request.sent", requestId, text: normalized });
    await chat.sendMessage(
      { text: normalized },
      {
        body: {
          requestId,
          sessionId: sessionId.current,
          sessionKey: sessionKey.current,
        },
      },
    );
  }, [chat, dispatch]);

  const stop = useCallback(async () => {
    await chat.stop();
    if (snapshot.runId) {
      await (options.fetch || fetch)(
        `/api/runs/${encodeURIComponent(snapshot.runId)}/stop`,
        { method: "POST" },
      );
    }
    const requestId = activeRequestId.current;
    if (requestId) dispatch({ type: "stream.interrupted", requestId });
  }, [chat, dispatch, options.fetch, snapshot.runId]);

  const retry = useCallback(async () => {
    if (activeText.current) await submit(activeText.current);
  }, [submit]);

  const reset = useCallback(() => {
    chat.setMessages([]);
    chat.clearError();
    activeRequestId.current = null;
    activeText.current = "";
    sessionId.current = nextSessionId();
    reduce({ kind: "reset" });
  }, [chat]);

  return {
    snapshot,
    transportBusy:
      chat.status === "submitted" || chat.status === "streaming",
    submit,
    stop,
    retry,
    reset,
  };
}
