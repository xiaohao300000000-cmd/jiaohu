import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

function SheetHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <main className="app-shell">
        <button type="button" onClick={() => setOpen(true)}>
          打开确认
        </button>
      </main>
      <TaskSheet open={open} onClose={() => setOpen(false)}>
        <button type="button">取消操作</button>
        <button type="button">确认操作</button>
      </TaskSheet>
    </>
  );
}

describe("TaskSheet focus lifecycle", () => {
  it("traps focus, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);

    const trigger = screen.getByRole("button", { name: "打开确认" });
    await user.click(trigger);

    const closeButton = screen.getByRole("button", { name: "关闭确认面板" });
    expect(closeButton).toHaveFocus();
    expect(document.querySelector(".app-shell")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "确认操作" })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.querySelector(".app-shell")).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });
});
