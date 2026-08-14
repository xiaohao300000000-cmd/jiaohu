import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyUIMessage } from "./ai/journey-ui-message";
import App from "./App";

function liveResponse(requestId: string, includePupu = false): Response {
  const stream = createUIMessageStream<JourneyUIMessage>({
    execute({ writer }) {
      writer.write({
        type: "data-journey",
        data: { type: "stream.started", requestId, runId: "run-live-1" },
      });
      writer.write({
        type: "data-journey",
        data: {
          type: "task.updated",
          requestId,
          task: {
            taskId: "task-live-1",
            version: 2,
            requestText: "朴朴搜索商品",
            domain: "commerce",
            goal: includePupu ? "prepare_cart" : "find_products",
            phase: includePupu ? "awaiting_cart_confirmation" : "searching_catalog",
            context: {
              dietaryRequirements: [],
              requirements: ["朴朴搜索商品"],
              selectedProducts: includePupu ? [{
                productId: "store-1",
                name: "鲜牛奶",
                quantity: 1,
                unitPriceCents: 1290,
                source: "pupu_live",
              }] : [],
            },
            ...(includePupu ? {
              finalPlan: {
                planId: "plan-live-1",
                version: 1,
                title: "朴朴实时商品方案",
                explanation: "商品、价格与库存来自结构化最终方案。",
                totalCents: 1290,
                currency: "CNY",
              },
            } : {}),
            requestedCapabilities: ["commerce.catalog.search"],
            allowedCapabilities: includePupu
              ? ["commerce.cart.prepare"]
              : ["commerce.catalog.search"],
            nextActions: includePupu ? ["confirm_cart"] : ["search_catalog"],
          },
        },
      });
      writer.write({
        type: "data-journey",
        data: {
          type: "stream.finished",
          requestId,
          result: {
            title: "朴朴实时方案",
            summary: "实时查询完成",
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

function installLiveFetch(includePupu = false) {
  const fetchMock = vi.fn(async (input, init) => {
    const url = String(input);
    if (url === "/api/pupu/login/status") {
      return Response.json({ phase: "connected" });
    }
    if (url === "/api/pupu/addresses") {
      return Response.json({ addresses: [{
        id: "receiver-a", label: "地址 1", region: "已保存区域",
        detailHint: "3 栋 1201", phoneSuffix: "",
      }] });
    }
    if (url === "/api/pupu/addresses/select") {
      return Response.json({ selected: true, addressId: "receiver-a" });
    }
    const body = JSON.parse(String(init?.body));
    return liveResponse(body.requestId, includePupu);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("live Agent home", () => {
  it("starts on the universal home with confirmed-operation disclosure", () => {
    installLiveFetch();
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "今天想让我做什么？" }),
    ).toBeVisible();
    expect(
      screen.getByText("Hermes 实时通道 · 朴朴操作均需确认"),
    ).toBeVisible();
  });

  it("routes every submitted task onto the live canvas", async () => {
    installLiveFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "查一下我的快递");
    await user.click(screen.getByRole("button", { name: "发送指令" }));

    expect(await screen.findByText("来自你的输入")).toBeInTheDocument();
    expect(screen.getByText("查一下我的快递")).toBeInTheDocument();
    expect(screen.queryByTestId("anchored-result")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Agent 决策已完成")).toBeVisible(),
    );
  });

  it("renders only streamed live Pupu data and gates cart mutation behind preview", async () => {
    installLiveFetch(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "朴朴搜索商品" }));

    expect(
      await screen.findByRole("heading", { name: "朴朴实时商品方案" }),
    ).toBeVisible();
    expect(screen.getByText("¥12.90")).toBeVisible();
    expect(screen.queryByText(/预算/)).toBeNull();
    expect(screen.getByRole("button", { name: "准备加入购物车" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "确认加入朴朴购物车" })).toBeNull();
    expect(screen.queryByText("示例数据")).toBeNull();
  });
});
