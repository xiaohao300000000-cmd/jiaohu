import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskSheet } from "./TaskSheet";

describe("TaskSheet", () => {
  it("renders an accessible dismissible bottom sheet", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TaskSheet open onClose={onClose}>
        <p>确认退款</p>
      </TaskSheet>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "需要你的确认" }),
      ).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "关闭确认面板" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
