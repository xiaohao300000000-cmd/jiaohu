import { AnimatePresence, motion } from "motion/react";
import { JOURNEY_SPRINGS, JOURNEY_TWEENS } from "../../config/motion";
import type {
  JourneyResult,
  JourneyResultItem,
  PartialJourneyResult,
} from "./types";

interface JourneyResultStackProps {
  partialResult: PartialJourneyResult | null;
  result: JourneyResult | null;
  settled: boolean;
}

function formatCurrency(amount: number, currency = "CNY") {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function ResultItem({ item }: { item: JourneyResultItem }) {
  return (
    <motion.li
      className="journey-result__item"
      layoutId={`journey-item-${item.id}`}
      transition={JOURNEY_SPRINGS.quickSnappy}
    >
      <span>
        <strong>{item.name}</strong>
        <small>{item.detail}</small>
      </span>
      <b>{formatCurrency(item.price)}</b>
    </motion.li>
  );
}

export function JourneyResultStack({
  partialResult,
  result,
  settled,
}: JourneyResultStackProps) {
  const displayed = result ?? partialResult;

  return (
    <AnimatePresence mode="popLayout">
      {displayed && (
        <motion.article
          className={`journey-result${settled ? " journey-result--settled" : ""}`}
          key="journey-result"
          layout
          layoutId="journey-result-shell"
          initial={{ opacity: 0, y: 20, scale: 0.975 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.985 }}
          transition={{
            layout: settled
              ? JOURNEY_SPRINGS.groundedSettle
              : JOURNEY_SPRINGS.quickSnappy,
            opacity: JOURNEY_TWEENS.veil,
          }}
        >
          <header className="journey-result__header">
            <span className="journey-result__eyebrow">
              {settled ? "PLAN READY" : "ASSEMBLING"}
            </span>
            <h2>{displayed.title ?? "正在汇合方案"}</h2>
            {displayed.summary && <p>{displayed.summary}</p>}
          </header>

          {displayed.items && displayed.items.length > 0 && (
            <ul className="journey-result__items">
              {displayed.items.map((item) => (
                <ResultItem item={item} key={item.id} />
              ))}
            </ul>
          )}

          {typeof displayed.totalAmount === "number" && (
            <div className="journey-result__total">
              <span>方案合计</span>
              <strong>
                {formatCurrency(
                  displayed.totalAmount,
                  displayed.currency ?? "CNY",
                )}
              </strong>
            </div>
          )}
        </motion.article>
      )}
    </AnimatePresence>
  );
}
