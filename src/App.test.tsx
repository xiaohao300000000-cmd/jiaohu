import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyUIMessage } from "./ai/journey-ui-message";
import App from "./App";

function hermesResponse(requestId: string): Response {
  const stream = createUIMessageStream<JourneyUIMessage>({
    execute({ writer }) {
      writer.write({
        type: "data-journey",
        data: { type: "stream.started", requestId, runId: "run-live-1" },
      });
      writer.write({
        type: "data-journey",
        data: {
          type: "trace.updated",
          requestId,
          entries: [{
            id: "call-1",
            label: "执行 Pupu CLI",
            detail: "pupu_cli",
            status: "complete",
          }],
        },
      });
      writer.write({
        type: "data-journey",
        data: {
          type: "stream.finished",
          requestId,
          result: {
            title: "Hermes 执行结果",
            summary: "购物车已更新",
            totalAmount: 0,
            currency: "CNY",
            items: [],
          },
        },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hermes Pupu CLI frontend", () => {
  it("identifies the complete Hermes Pupu CLI channel", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<App />);

    expect(screen.getByText("Hermes 实时通道 · 完整 Pupu CLI")).toBeVisible();
  });

  it("renders Hermes events and the Hermes final result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return hermesResponse(body.requestId);
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "把牛奶加入购物车");
    await user.click(screen.getByRole("button", { name: "发送指令" }));

    await waitFor(() => {
      expect(screen.getByText("Hermes 执行已完成")).toBeVisible();
    });
    expect(screen.getByText("购物车已更新")).toBeVisible();
  });
});
