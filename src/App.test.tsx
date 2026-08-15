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
  localStorage.clear();
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

  it("keeps one Hermes session across follow-ups and rotates only it on reset", async () => {
    const chatBodies: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (String(input).startsWith("/api/runs/")) {
        return Response.json({ ok: true }, { status: 202 });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      chatBodies.push(body);
      return hermesResponse(body.requestId);
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "找牛奶");
    await user.click(screen.getByRole("button", { name: "发送指令" }));
    await waitFor(() => expect(chatBodies).toHaveLength(1));

    await user.type(screen.getByLabelText("输入新的生活指令"), "看看第二个");
    await user.click(screen.getByRole("button", { name: "发送新指令" }));
    await waitFor(() => expect(chatBodies).toHaveLength(2));

    expect(chatBodies[0].sessionId).toBeTruthy();
    expect(chatBodies[1].sessionId).toBe(chatBodies[0].sessionId);
    expect(chatBodies[1].requestId).not.toBe(chatBodies[0].requestId);
    expect(chatBodies[0].sessionKey).toBeTruthy();
    expect(chatBodies[1].sessionKey).toBe(chatBodies[0].sessionKey);

    await user.click(screen.getByRole("button", { name: "返回首页" }));
    await waitFor(() => {
      expect(screen.getByText("Hermes 实时通道 · 完整 Pupu CLI")).toBeVisible();
    });
    await user.type(screen.getByLabelText("输入生活指令"), "新会话找苹果");
    await user.click(screen.getByRole("button", { name: "发送指令" }));
    await waitFor(() => expect(chatBodies).toHaveLength(3));

    expect(chatBodies[2].sessionId).toBeTruthy();
    expect(chatBodies[2].sessionId).not.toBe(chatBodies[0].sessionId);
    expect(chatBodies[2].sessionKey).toBe(chatBodies[0].sessionKey);
  });
});
