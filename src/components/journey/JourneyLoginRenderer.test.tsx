import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initialJourneySnapshot } from "./journey-reducer";
import { JourneyPresentationRenderer } from "./JourneyPresentationRenderer";

describe("Journey login presentation registry", () => {
  it("selects pupu.login inside the current Journey", () => {
    render(
      <JourneyPresentationRenderer
        snapshot={{
          ...initialJourneySnapshot,
          state: "awaiting_input",
          activeRequestId: "request-login-1",
          presentation: {
            capability: "pupu",
            component: "pupu.login",
            mode: "canvas",
            dataSource: "live",
            payload: { phase: "phone" },
          },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "连接你的朴朴账号" })).toBeInTheDocument();
    expect(document.querySelector('[data-component="pupu.login"]')).toHaveAttribute(
      "data-phase", "phone",
    );
  });
});

