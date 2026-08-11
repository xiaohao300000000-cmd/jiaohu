import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { initialJourneySnapshot, journeyReducer } from "./journey-reducer";
import type {
  AwaitingInput,
  JourneyEvent,
  JourneyResult,
  TraceEntry,
} from "./types";

interface UseJourneyDemoOptions {
  autoPlay?: boolean;
}

const defaultRequest = "今晚三个人吃火锅，微辣，200元以内。";

const firstTrace: TraceEntry[] = [
  {
    id: "understand-request",
    label: "理解人数、口味与预算",
    detail: "3 人 · 微辣 · 不超过 ¥200",
    status: "complete",
  },
  {
    id: "match-preferences",
    label: "匹配常用购买偏好",
    detail: "优先冷鲜，补足荤素与饮品",
    status: "active",
  },
];

const completeTrace: TraceEntry[] = [
  firstTrace[0],
  { ...firstTrace[1], status: "complete" },
  {
    id: "assemble-plan",
    label: "汇合采购结果",
    detail: "已组合 4 类食材，保留 ¥31.50 预算余量",
    status: "complete",
  },
];

const completeResult: JourneyResult = {
  title: "今晚的微辣火锅方案",
  summary: "荤素搭配，3 人份，预计 30 分钟送达",
  totalAmount: 168.5,
  currency: "CNY",
  items: [
    { id: "base", name: "醇香清油火锅底料", detail: "微辣 · 220g", price: 18.5 },
    { id: "beef", name: "原切雪花肥牛卷", detail: "冷鲜 · 350g", price: 58 },
    { id: "lamb", name: "原切羊肉卷", detail: "冷鲜 · 300g", price: 49 },
    { id: "vegetables", name: "有机火锅蔬菜包", detail: "当日鲜采 · 600g", price: 25 },
    { id: "drink", name: "无糖鲜榨玉米汁", detail: "冷藏 · 1L", price: 18 },
  ],
};

export function useJourneyDemo({
  autoPlay = true,
}: UseJourneyDemoOptions = {}) {
  const [snapshot, dispatch] = useReducer(
    journeyReducer,
    initialJourneySnapshot,
  );
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const requestCounter = useRef(0);
  const pendingReplacement = useRef<{ requestId: string; text: string } | null>(
    null,
  );

  const nextRequestId = useCallback(() => {
    requestCounter.current += 1;
    return `demo-request-${requestCounter.current}`;
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) {
      clearTimeout(timer);
    }
    timers.current.clear();
  }, []);

  const schedule = useCallback((delay: number, event: JourneyEvent) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      dispatch(event);
    }, delay);
    timers.current.add(timer);
  }, []);

  const scheduleCompletion = useCallback(
    (requestId: string, startAt = 0) => {
      schedule(startAt + 450, {
        type: "result.partial",
        requestId,
        result: {
          title: completeResult.title,
          summary: completeResult.summary,
          totalAmount: completeResult.totalAmount,
          currency: completeResult.currency,
          items: completeResult.items.slice(0, 3),
        },
      });
      schedule(startAt + 1_300, {
        type: "stream.finished",
        requestId,
        result: completeResult,
      });
    },
    [schedule],
  );

  const scheduleStandardBody = useCallback(
    (requestId: string) => {
      schedule(500, {
        type: "stream.started",
        requestId,
        runId: `demo-${requestId}`,
      });
      schedule(1_050, {
        type: "trace.updated",
        requestId,
        entries: firstTrace,
      });
      schedule(1_850, {
        type: "trace.updated",
        requestId,
        entries: completeTrace,
      });
      schedule(2_650, {
        type: "result.partial",
        requestId,
        result: {
          title: completeResult.title,
          summary: completeResult.summary,
          totalAmount: completeResult.totalAmount,
          currency: completeResult.currency,
          items: completeResult.items.slice(0, 3),
        },
      });
      schedule(3_750, {
        type: "stream.finished",
        requestId,
        result: completeResult,
      });
    },
    [schedule],
  );

  const startStandard = useCallback((text = defaultRequest) => {
    clearTimers();
    pendingReplacement.current = null;
    const requestId = nextRequestId();
    dispatch({
      type: "request.sent",
      requestId,
      text: text.trim() || defaultRequest,
    });
    scheduleStandardBody(requestId);
  }, [clearTimers, nextRequestId, scheduleStandardBody]);

  const playError = useCallback(() => {
    clearTimers();
    pendingReplacement.current = null;
    const requestId = nextRequestId();
    dispatch({ type: "request.sent", requestId, text: defaultRequest });
    schedule(500, {
      type: "stream.started",
      requestId,
      runId: `demo-${requestId}`,
    });
    schedule(1_050, {
      type: "trace.updated",
      requestId,
      entries: firstTrace,
    });
    schedule(1_800, {
      type: "stream.failed",
      requestId,
      error: {
        kind: "timeout",
        message: "本次连接等待时间过长",
        reference: "demo_018",
      },
    });
  }, [clearTimers, nextRequestId, schedule]);

  const playApproval = useCallback((
    text = defaultRequest,
    customInput?: AwaitingInput,
  ) => {
    clearTimers();
    pendingReplacement.current = null;
    const requestId = nextRequestId();
    dispatch({
      type: "request.sent",
      requestId,
      text: text.trim() || defaultRequest,
    });
    schedule(450, {
      type: "stream.started",
      requestId,
      runId: `demo-${requestId}`,
    });
    schedule(950, {
      type: "trace.updated",
      requestId,
      entries: completeTrace.slice(0, 2),
    });
    schedule(1_550, {
      type: "approval.requested",
      requestId,
      input: customInput ?? {
        kind: "approval",
        approvalId: `approval-${requestId}`,
        title: "确认提交采购单",
        impact: "将创建一笔待支付订单，不会自动扣款",
        target: "朴朴超市 · 今晚火锅清单",
        amount: completeResult.totalAmount,
        currency: completeResult.currency,
      },
    });
  }, [clearTimers, nextRequestId, schedule]);

  const respondToApproval = useCallback(
    (approved: boolean) => {
      const requestId = snapshot.activeRequestId;
      if (!requestId || snapshot.state !== "awaiting_input") {
        return;
      }
      clearTimers();
      dispatch({ type: "approval.responded", requestId, approved });
      schedule(220, {
        type: "trace.updated",
        requestId,
        entries: approved
          ? completeTrace
          : [
              ...completeTrace.slice(0, 2),
              {
                id: "approval-denied",
                label: "已按你的选择跳过提交",
                detail: "方案仍可查看，不会创建订单",
                status: "complete",
              },
            ],
      });
      scheduleCompletion(requestId, 250);
    },
    [clearTimers, schedule, scheduleCompletion, snapshot.activeRequestId, snapshot.state],
  );

  const submitClarification = useCallback(
    (_value: string) => {
      const requestId = snapshot.activeRequestId;
      if (!requestId || snapshot.state !== "awaiting_input") {
        return;
      }
      clearTimers();
      dispatch({ type: "approval.responded", requestId, approved: true });
      scheduleCompletion(requestId, 150);
    },
    [clearTimers, scheduleCompletion, snapshot.activeRequestId, snapshot.state],
  );

  const interruptWith = useCallback(
    (text: string) => {
      const requestId = snapshot.activeRequestId;
      const replacementText = text.trim();
      if (!requestId || !replacementText) {
        return;
      }
      clearTimers();
      const replacementRequestId = nextRequestId();
      pendingReplacement.current = {
        requestId: replacementRequestId,
        text: replacementText,
      };
      dispatch({
        type: "stream.interrupted",
        requestId,
        replacementRequestId,
      });
    },
    [clearTimers, nextRequestId, snapshot.activeRequestId],
  );

  const completeInterruptionExit = useCallback(() => {
    const replacement = pendingReplacement.current;
    if (!replacement) {
      return;
    }
    pendingReplacement.current = null;
    dispatch({
      type: "request.sent",
      requestId: replacement.requestId,
      text: replacement.text,
    });
    scheduleStandardBody(replacement.requestId);
  }, [scheduleStandardBody]);

  const retry = useCallback(() => {
    clearTimers();
    const requestId = nextRequestId();
    dispatch({ type: "retry.requested", requestId });
    scheduleStandardBody(requestId);
  }, [clearTimers, nextRequestId, scheduleStandardBody]);

  useEffect(() => {
    if (autoPlay) {
      startStandard();
    }
  }, [autoPlay, startStandard]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    snapshot,
    startStandard,
    playError,
    playApproval,
    interruptWith,
    completeInterruptionExit,
    retry,
    respondToApproval,
    submitClarification,
  };
}
