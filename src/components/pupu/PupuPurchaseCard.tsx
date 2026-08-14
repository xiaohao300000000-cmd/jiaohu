import {
  ChevronDown,
  PackageSearch,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { TaskSnapshot } from "../../domain/task-contract";
import { JOURNEY_SPRINGS } from "../../config/motion";
import "./pupu-purchase.css";
import { PupuCartConfirmCard } from "./PupuCartConfirmCard";
import { createPupuCommerceClient } from "../../ai/pupu-commerce-client";

interface PupuPurchaseCardProps {
  task: TaskSnapshot;
  instanceId: string;
  readOnly?: boolean;
}

export function PupuPurchaseCard({
  task,
  instanceId,
  readOnly = false,
}: PupuPurchaseCardProps) {
  const commerce = useMemo(() => createPupuCommerceClient(), []);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const plan = task.finalPlan;
  const products = task.context.selectedProducts;
  if (!plan || products.length === 0) return null;

  const estimatedTotal = plan.totalCents / 100;
  const userBudget =
    task.context.budgetCents === undefined
      ? null
      : task.context.budgetCents / 100;
  const budgetPercent = userBudget && userBudget > 0
    ? Math.min(100, (estimatedTotal / userBudget) * 100)
    : null;


  return (
    <motion.article
      className="pupu-purchase-card"
      aria-labelledby="pupu-purchase-title"
      data-component="pupu.purchase-plan"
      data-source="task-snapshot"
      data-plan-id={plan.planId}
      layoutId={`journey-${instanceId}-pupu-surface`}
      transition={JOURNEY_SPRINGS.groundedSettle}
    >
      <header className="pupu-decision">
        <span className="pupu-decision__eyebrow">Agent 选定的采购方案</span>
        <h1 id="pupu-purchase-title">{plan.title}</h1>
        <div className="pupu-decision__facts" aria-label="方案关键数据">
          <div>
            <small>{userBudget ? "预算" : "合计"}</small>
            <strong>
              ¥{estimatedTotal.toFixed(2)}
              {userBudget ? ` / ¥${userBudget.toFixed(2)}` : null}
            </strong>
          </div>
        </div>
        {budgetPercent !== null && (
          <div
            className="pupu-budget-track"
            role="progressbar"
            aria-label="预算使用比例"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(budgetPercent)}
          >
            <span style={{ width: `${budgetPercent}%` }} />
          </div>
        )}
        {task.context.dietaryRequirements.length > 0 && (
          <ul className="pupu-constraints" aria-label="饮食要求">
            {task.context.dietaryRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        )}
        <p className="pupu-decision__summary">{plan.explanation}</p>
      </header>

      <button
        className="pupu-evidence-toggle"
        type="button"
        aria-expanded={evidenceOpen}
        aria-controls="pupu-product-evidence"
        onClick={() => setEvidenceOpen((current) => !current)}
      >
        <span>
          <PackageSearch size={17} strokeWidth={1.65} aria-hidden="true" />
          {evidenceOpen
            ? "收起已选商品"
            : `查看已选商品（${products.length} 件）`}
        </span>
        <ChevronDown
          className={evidenceOpen ? "is-open" : undefined}
          size={17}
          strokeWidth={1.7}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {evidenceOpen && (
          <motion.div
            id="pupu-product-evidence"
            className="pupu-product-list"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={JOURNEY_SPRINGS.quickSnappy}
          >
            {products.map((product, index) => (
              <motion.div
                className="pupu-product"
                key={product.productId}
                layoutId={`journey-${instanceId}-pupu-product-${product.productId}`}
              >
                <span className="pupu-product__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="pupu-product__copy">
                  <strong>{product.name}</strong>
                  <span>数量 {product.quantity}</span>
                  <small>实时商品</small>
                </div>
                <b>¥{((product.unitPriceCents * product.quantity) / 100).toFixed(2)}</b>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!readOnly && task.phase === "awaiting_cart_confirmation" && (
        <PupuCartConfirmCard task={task} commerce={commerce} />
      )}
    </motion.article>
  );
}
