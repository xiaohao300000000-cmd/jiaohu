import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  AgentUIEvent,
  PupuPurchasePayload,
} from "../components/agent/agent-ui-event";
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

function nextRequestId(): string {
  return `journey-${crypto.randomUUID()}`;
}

export function useLiveJourney(
  options: UseLiveJourneyOptions = {},
) {
  const [snapshot, reduce] = useReducer(liveReducer, initialJourneySnapshot);
  const [pupuEvent, setPupuEvent] =
    useState<AgentUIEvent<PupuPurchasePayload> | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
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
        return;
      }
      if (part.type === "data-pupu") {
        setPupuEvent(part.data);
        const requestId = activeRequestId.current;
        if (!requestId) return;
        dispatch({
          type: "result.partial",
          requestId,
          result: {
            title: part.data.payload.title,
            summary: part.data.payload.summary,
            totalAmount: part.data.payload.total,
            currency: part.data.payload.currency,
            items: part.data.payload.products.map((product) => ({
              id: product.productId,
              name: product.name,
              detail: product.specification,
              price: product.unitPrice * product.quantity,
            })),
          },
        });
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

  useEffect(() => {
    const assistant = [...chat.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const nextRunId = assistant?.metadata?.runId;
    if (nextRunId) setRunId(nextRunId);
  }, [chat.messages]);

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
      setPupuEvent(null);
      setRunId(null);
      dispatch({ type: "request.sent", requestId, text: normalized });
      try {
        await chat.sendMessage(
          { text: normalized },
          { body: { requestId } },
        );
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
    if (runId) {
      try {
        await (options.fetch || fetch)(
          `/api/runs/${encodeURIComponent(runId)}/stop`,
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
  }, [chat, dispatch, options.fetch, runId]);

  const retry = useCallback(async () => {
    if (activeText.current) await submit(activeText.current);
  }, [submit]);

  const reset = useCallback(() => {
    chat.setMessages([]);
    chat.clearError();
    activeRequestId.current = null;
    activeText.current = "";
    setPupuEvent(null);
    setRunId(null);
    reduce({ kind: "reset" });
  }, [chat]);

  return {
    snapshot,
    pupuEvent,
    status: chat.status,
    submit,
    stop,
    retry,
    reset,
  };
}
