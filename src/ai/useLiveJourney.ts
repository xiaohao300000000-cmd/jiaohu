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
import { isPupuTask } from "../components/home/presentation";
import { createPupuLoginClient, type PupuLoginResponse } from "./pupu-login-client";

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
  const heldTask = useRef<{ text: string; token: string } | null>(null);
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

  const sendToHermes = useCallback(
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
  const showLogin = useCallback(
    (response: PupuLoginResponse) => {
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
          payload: response.phase === "auth_required" ? { phase: "phone" } : response,
        },
      });
    },
    [dispatch],
  );

  const resumeHeldTask = useCallback(async () => {
    const held = heldTask.current;
    if (!held) return;
    heldTask.current = null;
    showLogin({ phase: "connected" });
    await sendToHermes(held.text);
  }, [sendToHermes, showLogin]);

  const submit = useCallback(async (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    if (!isPupuTask(normalized)) {
      await sendToHermes(normalized);
      return;
    }
    const requestId = nextRequestId();
    activeRequestId.current = requestId;
    activeText.current = normalized;
    heldTask.current = { text: normalized, token: crypto.randomUUID() };
    dispatch({ type: "request.sent", requestId, text: normalized });
    try {
      const status = await loginClient.status();
      if (status.phase === "connected") await resumeHeldTask();
      else showLogin(status);
    } catch {
      dispatch({
        type: "stream.failed",
        requestId,
        error: {
          kind: "provider",
          message: "朴朴登录服务暂时不可用，请稍后重试。",
        },
      });
    }
  }, [dispatch, loginClient, resumeHeldTask, sendToHermes, showLogin]);

  const runLoginStep = useCallback(async (
    phase: "requesting" | "applying_captcha" | "verifying",
    action: () => Promise<PupuLoginResponse>,
  ) => {
    if (!heldTask.current) return;
    showLogin({ phase });
    try {
      const response = await action();
      if (response.phase === "connected") await resumeHeldTask();
      else showLogin(response);
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
  }, [resumeHeldTask, showLogin]);

  const submitLoginPhone = useCallback(
    (phone: string) => runLoginStep("requesting", () => loginClient.start(phone)),
    [loginClient, runLoginStep],
  );
  const completeLoginCaptcha = useCallback(
    () => runLoginStep("applying_captcha", loginClient.completeCaptcha),
    [loginClient, runLoginStep],
  );
  const submitLoginCode = useCallback(
    (code: string) => runLoginStep("verifying", () => loginClient.verify(code)),
    [loginClient, runLoginStep],
  );
  const resendLoginCode = useCallback(async () => {
    if (!heldTask.current) return;
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
    heldTask.current = null;
    try {
      await loginClient.cancel();
    } catch {}
    const requestId = activeRequestId.current;
    if (requestId) dispatch({ type: "stream.interrupted", requestId });
  }, [dispatch, loginClient]);


  const stop = useCallback(async () => {
    await chat.stop();
    heldTask.current = null;
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
    heldTask.current = null;
    reduce({ kind: "reset" });
  }, [chat]);

  const transportBusy =
    chat.status === "submitted" || chat.status === "streaming";

  return {
    snapshot,
    transportBusy,
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
