import { describe, expect, it } from "vitest";
import { initialJourneySnapshot, journeyReducer } from "./journey-reducer";
import type { JourneyPresentation } from "./types";

function login(phase: "phone" | "requesting" | "captcha" | "sms" | "verifying" | "connected" | "error"): JourneyPresentation {
  return {
    capability: "pupu",
    component: "pupu.login",
    mode: "canvas",
    dataSource: "live",
    payload: { phase },
  };
}

describe("Pupu login Journey state", () => {
  it("uses awaiting_input for user phases and reasoning for controller work", () => {
    const receiving = journeyReducer(initialJourneySnapshot, {
      type: "request.sent", requestId: "request-1", text: "pupu milk",
    });
    const phone = journeyReducer(receiving, {
      type: "presentation.updated", requestId: "request-1", presentation: login("phone"),
    });
    expect(phone.state).toBe("awaiting_input");

    const requesting = journeyReducer(phone, {
      type: "presentation.updated", requestId: "request-1", presentation: login("requesting"),
    });
    expect(requesting.state).toBe("reasoning");

    const captcha = journeyReducer(requesting, {
      type: "presentation.updated", requestId: "request-1", presentation: login("captcha"),
    });
    expect(captcha.state).toBe("awaiting_input");

    const connected = journeyReducer(captcha, {
      type: "presentation.updated", requestId: "request-1", presentation: login("connected"),
    });
    expect(connected.state).toBe("reasoning");
  });
});

