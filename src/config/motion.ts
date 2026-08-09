import type { Transition } from "motion/react";

export const JOURNEY_SPRINGS = {
  quickSnappy: {
    type: "spring",
    stiffness: 400,
    damping: 25,
  },
  groundedSettle: {
    type: "spring",
    stiffness: 180,
    damping: 24,
    mass: 1.2,
  },
} as const satisfies Record<string, Transition>;

export const JOURNEY_TWEENS = {
  fade: { duration: 0.18, ease: "easeOut" },
  veil: { duration: 0.28, ease: "easeInOut" },
} as const satisfies Record<string, Transition>;
