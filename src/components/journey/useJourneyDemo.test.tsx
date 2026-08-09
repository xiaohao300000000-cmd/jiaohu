import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJourneyDemo } from "./useJourneyDemo";

describe("useJourneyDemo", () => {
  it("starts the canvas journey with the submitted request", () => {
    const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));

    act(() => result.current.startStandard("今晚两个人吃什么"));

    expect(result.current.snapshot.requestText).toBe("今晚两个人吃什么");
    expect(result.current.snapshot.state).toBe("receiving");
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drives the complete demo through normalized lifecycle states", () => {
    const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));

    act(() => result.current.startStandard());
    expect(result.current.snapshot.state).toBe("receiving");

    act(() => vi.advanceTimersByTime(700));
    expect(result.current.snapshot.state).toBe("reasoning");

    act(() => vi.runAllTimers());
    expect(result.current.snapshot.state).toBe("ready");
    expect(result.current.snapshot.result?.title).toBe("今晚的微辣火锅方案");
  });

  it("ends the recoverable failure scenario in error", () => {
    const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));

    act(() => result.current.playError());
    act(() => vi.runAllTimers());

    expect(result.current.snapshot.state).toBe("error");
    expect(result.current.snapshot.error?.kind).toBe("timeout");
  });

  it("pauses approval until a human response resumes the flow", () => {
    const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));

    act(() => result.current.playApproval());
    act(() => vi.runAllTimers());
    expect(result.current.snapshot.state).toBe("awaiting_input");

    act(() => result.current.respondToApproval(true));
    expect(result.current.snapshot.state).toBe("reasoning");
    act(() => vi.runAllTimers());
    expect(result.current.snapshot.state).toBe("ready");
  });

  it("uses the supplied high-risk request and approval copy", () => {
    const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));

    act(() =>
      result.current.playApproval("确认退款", {
        kind: "approval",
        approvalId: "refund-demo",
        title: "确认退款申请",
        impact: "提交后将进入退款流程，不会立即到账",
        target: "示例订单",
        amount: 68,
        currency: "CNY",
      }),
    );
    act(() => vi.runAllTimers());

    expect(result.current.snapshot.requestText).toBe("确认退款");
    expect(result.current.snapshot.awaitingInput).toMatchObject({
      title: "确认退款申请",
      target: "示例订单",
    });
  });

  it("holds a replacement request until interruption exit completes", () => {
    const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));

    act(() => result.current.startStandard());
    act(() => vi.advanceTimersByTime(700));
    act(() => result.current.interruptWith("改成两个人吃寿喜锅。"));

    expect(result.current.snapshot.state).toBe("interrupted");
    expect(result.current.snapshot.requestText).not.toContain("寿喜锅");

    act(() => result.current.completeInterruptionExit());
    expect(result.current.snapshot.state).toBe("receiving");
    expect(result.current.snapshot.requestText).toBe("改成两个人吃寿喜锅。");
  });

  it("cancels outstanding scenario timers when unmounted", () => {
    const { result, unmount } = renderHook(() =>
      useJourneyDemo({ autoPlay: false }),
    );

    act(() => result.current.startStandard());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
