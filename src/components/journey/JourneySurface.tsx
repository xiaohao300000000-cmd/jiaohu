import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { JourneyState } from "./types";

interface JourneySurfaceProps {
  state: JourneyState;
  narrative: ReactNode;
  results: ReactNode;
  action: ReactNode;
}

const activeStates = new Set<JourneyState>([
  "receiving",
  "reasoning",
  "assembling",
]);

export function JourneySurface({
  state,
  narrative,
  results,
  action,
}: JourneySurfaceProps) {
  const isActive = activeStates.has(state);

  return (
    <section className="journey-surface" aria-labelledby="journey-title">
      <div
        className={`journey-ambient${isActive ? " journey-ambient--active" : ""}`}
        aria-hidden="true"
      >
        <motion.span
          className="journey-ambient__orb journey-ambient__orb--one"
          animate={isActive ? { x: [0, 18, 0], y: [0, -12, 0] } : { x: 0, y: 0 }}
          transition={
            isActive
              ? { duration: 5.6, ease: "easeInOut", repeat: Infinity }
              : { duration: 0.2 }
          }
        />
        <motion.span
          className="journey-ambient__orb journey-ambient__orb--two"
          animate={isActive ? { x: [0, -14, 0], y: [0, 16, 0] } : { x: 0, y: 0 }}
          transition={
            isActive
              ? { duration: 6.8, ease: "easeInOut", repeat: Infinity }
              : { duration: 0.2 }
          }
        />
      </div>

      <div className="journey-surface__narrative">{narrative}</div>
      <div
        className="journey-surface__results"
        data-journey-region="results"
        data-testid="journey-results"
      >
        {results}
      </div>
      <div
        className="journey-surface__action"
        data-journey-region="action"
        data-testid="journey-action"
      >
        {action}
      </div>
    </section>
  );
}
