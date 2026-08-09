import { RefreshCw, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { JOURNEY_SPRINGS } from "../../config/motion";
import type { JourneyError as JourneyErrorData, JourneyErrorKind } from "./types";

interface JourneyErrorProps {
  error: JourneyErrorData;
  onRetry?: () => void;
}

const safeErrorCopy: Record<
  JourneyErrorKind,
  { title: string; detail: string }
> = {
  offline: {
    title: "网络似乎断开了",
    detail: "已保留当前需求，恢复连接后可以从这里重新开始。",
  },
  timeout: {
    title: "这次等待有点久",
    detail: "方案没有完成确认，也不会把未知结果当成成功。",
  },
  provider: {
    title: "服务暂时没有回应",
    detail: "当前材料已经安全停住，可以稍后重新尝试。",
  },
  invalid_result: {
    title: "方案还没有整理完整",
    detail: "结果未通过展示校验，因此没有进入最终方案。",
  },
  unknown: {
    title: "方案暂时停住了",
    detail: "当前需求仍然保留，重新尝试不会丢失你的描述。",
  },
};

export function JourneyError({ error, onRetry }: JourneyErrorProps) {
  const copy = safeErrorCopy[error.kind];

  return (
    <motion.article
      className="journey-intervention journey-intervention--error"
      layoutId="journey-intervention"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={JOURNEY_SPRINGS.groundedSettle}
      role="alert"
    >
      <span className="journey-intervention__icon" aria-hidden="true">
        <TriangleAlert size={18} strokeWidth={1.8} />
      </span>
      <span className="journey-intervention__eyebrow">RECOVERABLE ERROR</span>
      <h2>{copy.title}</h2>
      <p>{copy.detail}</p>
      {error.reference && (
        <small className="journey-error-reference">
          参考编号 {error.reference}
        </small>
      )}
      <button className="journey-retry-action" type="button" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" />
        重试
      </button>
    </motion.article>
  );
}
