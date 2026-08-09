import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiquidJourney } from "./LiquidJourney";
import { initialJourneySnapshot } from "./journey-reducer";
import type { JourneySnapshot } from "./types";

function snapshot(
  overrides: Partial<JourneySnapshot>,
): JourneySnapshot {
  return {
    ...initialJourneySnapshot,
    activeRequestId: "request-1",
    requestText: "今晚三个人吃火锅，微辣，200元以内。",
    ...overrides,
  };
}

describe("LiquidJourney exceptional states", () => {
  afterEach(() => vi.useRealTimers());

  it("shows approval impact and exposes explicit keyboard controls", async () => {
    const user = userEvent.setup();
    const onApprovalResponse = vi.fn();
    render(
      <LiquidJourney
        snapshot={snapshot({
          state: "awaiting_input",
          awaitingInput: {
            kind: "approval",
            approvalId: "approval-1",
            title: "确认提交采购单",
            impact: "将创建一笔待支付订单",
            target: "朴朴超市 · 火锅清单",
            amount: 168.5,
            currency: "CNY",
          },
        })}
        onApprovalResponse={onApprovalResponse}
      />,
    );

    expect(screen.getByText("确认提交采购单")).toBeInTheDocument();
    expect(screen.getByText("将创建一笔待支付订单")).toBeInTheDocument();
    expect(screen.getByText("朴朴超市 · 火锅清单")).toBeInTheDocument();
    expect(screen.getByText("¥168.50")).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole("button", { name: "拒绝" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "长按确认" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onApprovalResponse).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "拒绝" }));
    expect(onApprovalResponse).toHaveBeenCalledWith(false);
  });

  it("requires a sustained pointer hold before approving", () => {
    vi.useFakeTimers();
    const onApprovalResponse = vi.fn();
    render(
      <LiquidJourney
        snapshot={snapshot({
          state: "awaiting_input",
          awaitingInput: {
            kind: "approval",
            approvalId: "approval-hold",
            title: "确认退款",
            impact: "将提交退款申请",
            target: "示例订单",
          },
        })}
        onApprovalResponse={onApprovalResponse}
      />,
    );

    const button = screen.getByRole("button", { name: "长按确认" });
    fireEvent.pointerDown(button, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(899));
    expect(onApprovalResponse).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onApprovalResponse).toHaveBeenCalledWith(true);
    fireEvent.pointerUp(button, { pointerId: 1 });
  });

  it("submits clarification through a labelled native form", async () => {
    const user = userEvent.setup();
    const onClarificationSubmit = vi.fn();
    render(
      <LiquidJourney
        snapshot={snapshot({
          state: "awaiting_input",
          awaitingInput: {
            kind: "clarification",
            title: "还差一个信息",
            question: "是否需要准备无糖饮品？",
          },
        })}
        onClarificationSubmit={onClarificationSubmit}
      />,
    );

    const input = screen.getByLabelText("补充说明");
    await user.type(input, "需要，两瓶。 ");
    await user.click(screen.getByRole("button", { name: "继续生成" }));
    expect(onClarificationSubmit).toHaveBeenCalledWith("需要，两瓶。");
  });

  it.each([
    ["offline", "网络似乎断开了"],
    ["timeout", "这次等待有点久"],
    ["provider", "服务暂时没有回应"],
    ["invalid_result", "方案还没有整理完整"],
    ["unknown", "方案暂时停住了"],
  ] as const)("maps %s errors to safe recovery copy", (kind, safeCopy) => {
    const onRetry = vi.fn();
    render(
      <LiquidJourney
        snapshot={snapshot({
          state: "error",
          error: {
            kind,
            message: "SECRET_PROVIDER_STACK_SHOULD_NOT_RENDER",
            reference: "run_018",
          },
        })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("heading", { name: safeCopy })).toBeInTheDocument();
    expect(
      screen.queryByText("SECRET_PROVIDER_STACK_SHOULD_NOT_RENDER"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("参考编号 run_018")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("finishes the old material exit before reporting an interruption complete", async () => {
    const onInterruptedExitComplete = vi.fn();
    const { rerender } = render(
      <LiquidJourney
        snapshot={snapshot({ state: "reasoning" })}
        onInterruptedExitComplete={onInterruptedExitComplete}
      />,
    );

    rerender(
      <LiquidJourney
        snapshot={snapshot({ state: "interrupted" })}
        onInterruptedExitComplete={onInterruptedExitComplete}
      />,
    );

    expect(
      screen.getByText("已停止当前方案", { selector: "strong" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(onInterruptedExitComplete).toHaveBeenCalledOnce();
    });
  });
});
