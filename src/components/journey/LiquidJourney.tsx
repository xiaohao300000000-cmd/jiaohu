import { ArrowUpRight, ChevronDown, ListChecks } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { JOURNEY_SPRINGS, JOURNEY_TWEENS } from "../../config/motion";
import { JourneyResultStack } from "./JourneyResultStack";
import { JourneyApproval } from "./JourneyApproval";
import { JourneyError } from "./JourneyError";
import { JourneySurface } from "./JourneySurface";
import { JourneyTrace } from "./JourneyTrace";
import type { JourneySnapshot, JourneyState } from "./types";
import { useState } from "react";
import "./liquid-journey.css";

interface LiquidJourneyProps {
  snapshot: JourneySnapshot;
  onOpenPlan?: () => void;
  onApprovalResponse?: (approved: boolean) => void;
  onClarificationSubmit?: (value: string) => void;
  onRetry?: () => void;
  onInterruptedExitComplete?: () => void;
}

const stateLabels: Record<JourneyState, string> = {
  idle: "准备接收新的生活指令",
  receiving: "正在接收需求",
  reasoning: "正在梳理约束",
  assembling: "正在汇合方案",
  ready: "方案已准备好",
  awaiting_input: "等待你的确认",
  error: "方案暂时停住了",
  interrupted: "已停止当前方案",
};

export function LiquidJourney({
  snapshot,
  onOpenPlan,
  onApprovalResponse,
  onClarificationSubmit,
  onRetry,
  onInterruptedExitComplete,
}: LiquidJourneyProps) {
  const isReady = snapshot.state === "ready" && snapshot.result !== null;
  const [planOpen, setPlanOpen] = useState(false);

  const togglePlan = () => {
    if (onOpenPlan) {
      onOpenPlan();
      return;
    }
    setPlanOpen((current) => !current);
  };

  const narrative = (
    <>
      <motion.div className="journey-heading" layout>
        <div className="journey-heading__status" role="status" aria-live="polite">
          <span aria-hidden="true" />
          {stateLabels[snapshot.state]}
        </div>
        <h1 id="journey-title">
          {snapshot.state === "idle" ? "Pupu 已就绪" : "把需求变成一份可执行的方案"}
        </h1>
        <p>
          {snapshot.state === "idle"
            ? "一句话交代晚餐、采购和家务，其余留给方案去生长。"
            : "需求正在被整理成清晰、可确认的生活方案。"}
        </p>
      </motion.div>

      <JourneyTrace entries={snapshot.trace} />
    </>
  );

  const planItems =
    isReady && snapshot.result ? snapshot.result.items : [];

  let results = (
    <>
      <JourneyResultStack
        partialResult={snapshot.partialResult}
        result={snapshot.result}
        settled={isReady}
      />
      {planOpen && planItems.length > 0 && (
        <motion.section
          className="journey-plan-detail"
          data-testid="journey-plan-detail"
          aria-label="采购方案商品清单"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={JOURNEY_SPRINGS.quickSnappy}
        >
          <header className="journey-plan-detail__header">
            <ListChecks size={18} strokeWidth={1.7} aria-hidden="true" />
            <strong>采购清单（{planItems.length} 件）</strong>
          </header>
          <ul className="journey-plan-detail__items">
            {planItems.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </span>
                <b>
                  {new Intl.NumberFormat("zh-CN", {
                    style: "currency",
                    currency: "CNY",
                    minimumFractionDigits: 2,
                  }).format(item.price)}
                </b>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </>
  );

  if (snapshot.state === "awaiting_input" && snapshot.awaitingInput) {
    results = (
      <JourneyApproval
        input={snapshot.awaitingInput}
        onApprovalResponse={onApprovalResponse}
        onClarificationSubmit={onClarificationSubmit}
      />
    );
  } else if (snapshot.state === "error" && snapshot.error) {
    results = <JourneyError error={snapshot.error} onRetry={onRetry} />;
  } else if (snapshot.state === "interrupted") {
    results = (
      <motion.article
        className="journey-interruption"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={JOURNEY_SPRINGS.quickSnappy}
      >
        <span>INTERRUPTED</span>
        <strong>已停止当前方案</strong>
        <p>正在收起旧材料，随后接收你的新指令。</p>
      </motion.article>
    );
  }

  const action = isReady ? (
    <motion.button
      className="journey-primary-action"
      type="button"
      onClick={togglePlan}
      aria-expanded={planOpen}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: JOURNEY_SPRINGS.groundedSettle,
        opacity: JOURNEY_TWEENS.fade,
      }}
    >
      <span>{planOpen ? "收起采购清单" : "查看采购方案"}</span>
      {planOpen ? (
        <ChevronDown size={19} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <ArrowUpRight size={19} strokeWidth={1.8} aria-hidden="true" />
      )}
    </motion.button>
  ) : null;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence
        initial={false}
        mode="sync"
        onExitComplete={
          snapshot.state === "interrupted"
            ? onInterruptedExitComplete
            : undefined
        }
      >
        <motion.div
          className="journey-presence-shell"
          key={snapshot.state === "interrupted" ? "interrupted" : "active"}
          initial={{ opacity: 0, y: 8, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.99 }}
          transition={JOURNEY_SPRINGS.quickSnappy}
        >
          <JourneySurface
            state={snapshot.state}
            narrative={narrative}
            results={results}
            action={action}
          />
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
