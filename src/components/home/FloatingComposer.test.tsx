import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FloatingComposer } from "./FloatingComposer";

describe("FloatingComposer", () => {
  it("submits a follow-up from its own floating glass layer", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FloatingComposer onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("输入新的生活指令"), "改成三个人");
    await user.click(screen.getByRole("button", { name: "发送新指令" }));

    expect(onSubmit).toHaveBeenCalledWith("改成三个人");
    expect(screen.getByTestId("floating-composer")).toHaveClass(
      "floating-composer",
    );
  });
});
