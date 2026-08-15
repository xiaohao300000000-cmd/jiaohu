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
import { createPupuLoginClient, type PupuLoginResponse } from "./pupu-login-client";

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

function nextSessionId(): string {
  return `hermes-${crypto.randomUUID()}`;
}

export function useLiveJourney(options: UseLiveJourneyOptions = {}) {
  const [snapshot, reduce] = useReducer(liveReducer, initialJourneySnapshot);
  const activeRequestId = useRef<string | null>(null);
  const activeText = useRef("");
  const heldText = useRef<string | null>(null);
  const sessionId = useRef(nextSessionId());
  const loginClient = useMemo(
    () => createPupuLoginClient(options.fetch || fetch),
    [options.fetch],
  );
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
      if (part.type !== "data-journey") return;
      if (
        part.data.type === "presentation.updated" &&
        part.data.presentation.component === "pupu.login"
      ) {
        heldText.current = activeText.current;
      }
      dispatch(part.data);
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
        },
      },
    );
  }, [chat, dispatch]);

  const showLogin = useCallback((response: PupuLoginResponse) => {
    const requestId = activeRequestId.current;
    if (!requestId) return;
    dispatch({
      type: "presentation.updated",
      requestId,
      presentation: {
        capability: "pupu",
        component: "pupu.login",
        mode: "canvas",
        dataSource: "live",
        payload: response.phase === "auth_required"
          ? { phase: "phone" }
          : response,
      },
    });
  }, [dispatch]);

  const runLoginStep = useCallback(async (
    phase: "requesting" | "applying_captcha" | "verifying",
    action: () => Promise<PupuLoginResponse>,
  ) => {
    if (!heldText.current) return;
    showLogin({ phase });
    try {
      const response = await action();
      showLogin(response);
      if (response.phase === "connected") {
        const text = heldText.current;
        heldText.current = null;
        if (text) await submit(text);
      }
    } catch {
      showLogin({
        phase: "error",
        error: {
          code: "login_unavailable",
          message: "朴朴登录暂时不可用，请重试当前步骤。",
          retryable: true,
        },
      });
    }
  }, [showLogin, submit]);

  const submitLoginPhone = useCallback(
    (phone: string) =>
      runLoginStep("requesting", () => loginClient.start(phone)),
    [loginClient, runLoginStep],
  );
  const completeLoginCaptcha = useCallback(
    () => runLoginStep("applying_captcha", loginClient.completeCaptcha),
    [loginClient, runLoginStep],
  );
  const submitLoginCode = useCallback(
    (code: string) =>
      runLoginStep("verifying", () => loginClient.verify(code)),
    [loginClient, runLoginStep],
  );
  const resendLoginCode = useCallback(async () => {
    if (!heldText.current) return;
    try {
      showLogin(await loginClient.resend());
    } catch {
      showLogin({
        phase: "error",
        error: {
          code: "resend_unavailable",
          message: "暂时无法重新发送，请稍后再试。",
          retryable: true,
        },
      });
    }
  }, [loginClient, showLogin]);

  const cancelLogin = useCallback(async () => {
    heldText.current = null;
    await loginClient.cancel();
    const requestId = activeRequestId.current;
    if (requestId) dispatch({ type: "stream.interrupted", requestId });
  }, [dispatch, loginClient]);

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
    heldText.current = null;
    sessionId.current = nextSessionId();
    reduce({ kind: "reset" });
  }, [chat]);

  return {
    snapshot,
    transportBusy:
      chat.status === "submitted" || chat.status === "streaming",
    submit,
    submitLoginPhone,
    submitLoginCode,
    completeLoginCaptcha,
    resendLoginCode,
    cancelLogin,
    stop,
    retry,
    reset,
  };
}
