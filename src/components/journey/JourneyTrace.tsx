import { Check, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { JOURNEY_SPRINGS, JOURNEY_TWEENS } from "../../config/motion";
import type { TraceEntry } from "./types";

interface JourneyTraceProps {
  entries: TraceEntry[];
}

export function JourneyTrace({ entries }: JourneyTraceProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <ol className="journey-trace" aria-label="执行摘要">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <motion.li
            className="journey-trace__item"
            key={entry.id}
            layout
            initial={{ opacity: 0, y: 10, filter: "blur(7px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(5px)" }}
            transition={{
              layout: JOURNEY_SPRINGS.quickSnappy,
              opacity: JOURNEY_TWEENS.fade,
              filter: JOURNEY_TWEENS.fade,
            }}
          >
            <span
              className={`journey-trace__marker journey-trace__marker--${entry.status}`}
              aria-hidden="true"
            >
              {entry.status === "complete" ? (
                <Check size={13} strokeWidth={2.4} />
              ) : (
                <LoaderCircle size={13} strokeWidth={2} />
              )}
            </span>
            <span className="journey-trace__copy">
              <strong>{entry.label}</strong>
              {entry.detail && <small>{entry.detail}</small>}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
