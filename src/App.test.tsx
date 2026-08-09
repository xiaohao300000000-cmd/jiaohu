import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("universal Agent home", () => {
  it("starts as a universal home instead of autoplaying dinner", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "今天想让我做什么？" }),
    ).toBeVisible();
    expect(
      screen.queryByText("把需求变成今晚的安排"),
    ).not.toBeInTheDocument();
  });

  it("anchors parcel results directly below the composer", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "查一下我的快递");
    await user.click(screen.getByRole("button", { name: "发送指令" }));

    const composer = screen.getByTestId("home-composer");
    const result = await screen.findByTestId("anchored-result");
    expect(
      composer.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(result).toHaveTextContent("你的包裹正在派送");
    expect(result).toHaveTextContent("示例数据");
  });

  it("offers Pupu order status as a first-class home action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "查一下我的朴朴订单");
    await user.click(screen.getByRole("button", { name: "发送指令" }));

    expect(await screen.findByTestId("anchored-result")).toHaveTextContent(
      "朴朴订单正在配送",
    );
  });

  it("generates a Pupu product plan from the core Agent input", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "朴朴帮我买" }));

    expect(
      await screen.findByRole("heading", { name: "今晚的火锅采购方案" }),
    ).toBeInTheDocument();
    expect(screen.getByText("示例数据")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入购物车" })).toBeInTheDocument();
  });

  it("turns the plan into a versioned assistant cart", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "朴朴帮我买" }));
    await user.click(await screen.findByRole("button", { name: "加入购物车" }));

    expect(await screen.findByText("已加入助手购物车")).toBeInTheDocument();
    expect(screen.getByText("购物车版本 v1")).toBeInTheDocument();
  });

  it("requires approval before syncing the real Pupu cart", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "朴朴帮我买" }));
    await user.click(await screen.findByRole("button", { name: "加入购物车" }));
    await user.click(
      await screen.findByRole("button", { name: "同步到朴朴购物车" }),
    );

    expect(
      screen.getByRole("dialog", { name: "需要你的确认" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("确认同步到朴朴购物车")).toBeInTheDocument();
  });

  it("moves complex planning requests onto the central canvas", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "今晚两个人吃什么");
    await user.click(screen.getByRole("button", { name: "发送指令" }));

    expect(
      await screen.findByRole("heading", {
        name: "把需求变成一份可执行的方案",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/今晚两个人吃什么/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "今天想让我做什么？" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the home behind a bottom sheet for high-risk requests", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("输入生活指令"), "确认退款");
    await user.click(screen.getByRole("button", { name: "发送指令" }));

    expect(
      screen.getByRole("dialog", { name: "需要你的确认" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "今天想让我做什么？" }),
    ).toBeInTheDocument();
  });
});
