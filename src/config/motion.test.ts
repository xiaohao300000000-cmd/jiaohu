import { describe, expect, it } from "vitest";
import { JOURNEY_SPRINGS } from "./motion";

describe("JOURNEY_SPRINGS", () => {
  it("locks the approved quick and grounded spring values", () => {
    expect(JOURNEY_SPRINGS).toEqual({
      quickSnappy: { type: "spring", stiffness: 400, damping: 25 },
      groundedSettle: {
        type: "spring",
        stiffness: 180,
        damping: 24,
        mass: 1.2,
      },
    });
  });
});
