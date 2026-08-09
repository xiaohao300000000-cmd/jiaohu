import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { JOURNEY_SPRINGS, JOURNEY_TWEENS } from "../../config/motion";

interface TaskSheetProps {
  open: boolean;
  children: ReactNode;
  onClose: () => void;
}

export function TaskSheet({ open, children, onClose }: TaskSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="task-sheet-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={JOURNEY_TWEENS.veil}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            className="task-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="需要你的确认"
            initial={{ opacity: 0, y: 44, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.99 }}
            transition={JOURNEY_SPRINGS.groundedSettle}
          >
            <div className="task-sheet__handle" aria-hidden="true" />
            <button
              className="task-sheet__close"
              type="button"
              aria-label="关闭确认面板"
              onClick={onClose}
            >
              <X size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
