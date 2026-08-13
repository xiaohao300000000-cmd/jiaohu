import { describe, expect, it } from "vitest";
import { isPupuRequest } from "./request-classifier";

describe("isPupuRequest", () => {
  it("classifies a complex low-fat three-dish meal as a Pupu request", () => {
    expect(
      isPupuRequest("我今晚想做一个低脂的三道菜，要步骤简单、营养全面。"),
    ).toBe(true);
  });
});
