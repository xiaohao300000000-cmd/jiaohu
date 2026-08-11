import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PupuLoginJourney } from "./PupuLoginJourney";

describe("PupuLoginJourney", () => {
  it("collects a new phone inside the Journey card", () => {
    const onPhoneSubmit = vi.fn();
    render(
      <PupuLoginJourney
        instanceId="one"
        presentation={{ phase: "phone" }}
        onPhoneSubmit={onPhoneSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13000000000" } });
    fireEvent.submit(screen.getByRole("form", { name: "朴朴登录" }));
    expect(onPhoneSubmit).toHaveBeenCalledWith("13000000000");
    expect(screen.queryByText("13000000000")).not.toBeInTheDocument();
  });

  it("embeds only a same-origin captcha URL", () => {
    const { rerender } = render(
      <PupuLoginJourney
        instanceId="one"
        presentation={{ phase: "captcha", attemptId: "attempt-1", captchaUrl: "/api/pupu/login/captcha/attempt-1" }}
      />,
    );
    expect(screen.getByTitle("朴朴安全验证")).toHaveAttribute(
      "src", "/api/pupu/login/captcha/attempt-1",
    );

    rerender(
      <PupuLoginJourney
        instanceId="one"
        presentation={{ phase: "captcha", attemptId: "attempt-1", captchaUrl: "https://evil.example/x" }}
      />,
    );
    expect(screen.queryByTitle("朴朴安全验证")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("passes the SMS code to a dedicated callback", () => {
    const onCodeSubmit = vi.fn();
    render(
      <PupuLoginJourney
        instanceId="one"
        presentation={{ phase: "sms", attemptId: "attempt-1", retryAfterSeconds: 30 }}
        onCodeSubmit={onCodeSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并继续" }));
    expect(onCodeSubmit).toHaveBeenCalledWith("123456");
  });
});

