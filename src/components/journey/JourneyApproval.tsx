import { ArrowRight, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { JOURNEY_SPRINGS } from "../../config/motion";
import type { AwaitingInput } from "./types";

interface JourneyApprovalProps {
  input: AwaitingInput;
  onApprovalResponse?: (approved: boolean) => void;
  onClarificationSubmit?: (value: string) => void;
}

function formatCurrency(amount: number, currency = "CNY") {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function JourneyApproval({
  input,
  onApprovalResponse,
  onClarificationSubmit,
}: JourneyApprovalProps) {
  const [clarification, setClarification] = useState("");
  const [isHolding, setIsHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setIsHolding(false);
  };

  useEffect(() => cancelHold, []);

  const beginApprovalHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelHold();
    setIsHolding(true);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setIsHolding(false);
      onApprovalResponse?.(true);
    }, 900);
  };

  const approveFromKeyboard = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) onApprovalResponse?.(true);
  };

  const submitClarification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = clarification.trim();
    if (value) {
      onClarificationSubmit?.(value);
    }
  };

  if (input.kind === "clarification") {
    return (
      <motion.article
        className="journey-intervention journey-intervention--clarification"
        layoutId="journey-intervention"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={JOURNEY_SPRINGS.groundedSettle}
      >
        <span className="journey-intervention__eyebrow">NEEDS CONTEXT</span>
        <h2>{input.title}</h2>
        <p>{input.question}</p>
        <form className="journey-clarification" onSubmit={submitClarification}>
          <label htmlFor="journey-clarification-input">补充说明</label>
          <div>
            <input
              id="journey-clarification-input"
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
              placeholder="输入你的补充信息"
            />
            <button type="submit">
              继续生成
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </form>
      </motion.article>
    );
  }

  return (
    <motion.article
      className="journey-intervention journey-intervention--approval"
      layoutId="journey-intervention"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={JOURNEY_SPRINGS.groundedSettle}
    >
      <header className="journey-intervention__header">
        <span className="journey-intervention__icon" aria-hidden="true">
          <ShieldCheck size={18} strokeWidth={1.8} />
        </span>
        <span className="journey-intervention__eyebrow">HUMAN APPROVAL</span>
      </header>
      <h2>{input.title}</h2>
      <p>{input.impact}</p>
      <dl className="journey-impact-list">
        <div>
          <dt>影响对象</dt>
          <dd>{input.target}</dd>
        </div>
        {typeof input.amount === "number" && (
          <div>
            <dt>涉及金额</dt>
            <dd>{formatCurrency(input.amount, input.currency)}</dd>
          </div>
        )}
      </dl>
      <div className="journey-intervention__actions">
        <button
          className="journey-secondary-action"
          type="button"
          onClick={() => onApprovalResponse?.(false)}
        >
          <X size={16} aria-hidden="true" />
          拒绝
        </button>
        <button
          className="journey-approval-action"
          type="button"
          data-holding={isHolding ? "true" : "false"}
          onPointerDown={beginApprovalHold}
          onPointerUp={cancelHold}
          onPointerCancel={cancelHold}
          onPointerLeave={cancelHold}
          onClick={approveFromKeyboard}
        >
          <span>长按确认</span>
          <ShieldCheck size={17} aria-hidden="true" />
        </button>
      </div>
      <small className="journey-intervention__hint">
        按住 0.9 秒完成确认；键盘回车可直接批准。
      </small>
    </motion.article>
  );
}
