import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JourneyOriginSurface } from "./JourneyOriginSurface";

describe("JourneyOriginSurface", () => {
  it("keeps the submitted sentence attached to one stable task object", () => {
    render(
      <JourneyOriginSurface requestText="两个人今晚火锅，120以内" state="reasoning">
        <p>正在梳理约束</p>
      </JourneyOriginSurface>,
    );

    expect(screen.getByText("来自你的输入")).toBeVisible();
    expect(screen.getByText("两个人今晚火锅，120以内")).toBeVisible();
    expect(screen.getByTestId("journey-origin")).toHaveAttribute(
      "data-layout-id",
      "journey-origin",
    );
  });
});
