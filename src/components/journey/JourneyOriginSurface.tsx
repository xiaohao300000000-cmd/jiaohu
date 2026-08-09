import { motion } from "motion/react";
import type { ReactNode } from "react";
import { JOURNEY_SPRINGS } from "../../config/motion";
import type { JourneyState } from "./types";

interface JourneyOriginSurfaceProps {
  requestText: string;
  state: JourneyState;
  children: ReactNode;
}

export function JourneyOriginSurface({
  requestText,
  state,
  children,
}: JourneyOriginSurfaceProps) {
  return (
    <motion.article
      className={`journey-origin journey-origin--${state}`}
      data-testid="journey-origin"
      data-layout-id="journey-origin"
      data-journey-state={state}
      layout
      layoutId="journey-origin"
      transition={JOURNEY_SPRINGS.groundedSettle}
    >
      <motion.header
        className="journey-origin__source"
        layout="position"
        transition={JOURNEY_SPRINGS.quickSnappy}
      >
        <span>来自你的输入</span>
        <motion.p
          layoutId="journey-request-text"
          transition={JOURNEY_SPRINGS.quickSnappy}
        >
          {requestText}
        </motion.p>
      </motion.header>
      <motion.div
        className="journey-origin__growth"
        layout="position"
        transition={JOURNEY_SPRINGS.groundedSettle}
      >
        {children}
      </motion.div>
    </motion.article>
  );
}
