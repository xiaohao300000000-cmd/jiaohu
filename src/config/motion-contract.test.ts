import { describe, expect, it } from "vitest";
import journeyTraceSource from "../components/journey/JourneyTrace.tsx?raw";
import journeyResultSource from "../components/journey/JourneyResultStack.tsx?raw";
import liquidJourneySource from "../components/journey/LiquidJourney.tsx?raw";
import journeyOriginSource from "../components/journey/JourneyOriginSurface.tsx?raw";

const motionSources = [
  journeyTraceSource,
  journeyResultSource,
  liquidJourneySource,
  journeyOriginSource,
];

describe("motion performance contract", () => {
  it("never animates filter or backdrop blur", () => {
    const source = motionSources.join("\n");

    expect(source).not.toMatch(
      /(?:initial|animate|exit)\s*=\s*\{\{[^}]*\b(?:filter|backdropFilter)\s*:/s,
    );
  });
});
