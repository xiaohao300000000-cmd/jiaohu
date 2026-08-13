import {
  ChevronDown,
  Clock3,
  ImageOff,
  PackageSearch,
  ShoppingBasket,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { JourneyPresentation } from "../journey/types";
import { JOURNEY_SPRINGS } from "../../config/motion";
import "./pupu-purchase.css";
import { PupuCartConfirmCard } from "./PupuCartConfirmCard";
import { createPupuCommerceClient } from "../../ai/pupu-commerce-client";

type PupuPresentation = Extract<
  JourneyPresentation,
  { component: "pupu.purchase-plan" }
>;

interface PupuPurchaseCardProps {
  presentation: PupuPresentation;
  instanceId: string;
  runId?: string;
  onAddToCart?: () => void;
  readOnly?: boolean;
  enableCommerce?: boolean;
}

export function PupuPurchaseCard({
  presentation,
  instanceId,
  runId,
  onAddToCart,
  readOnly = false,
  enableCommerce = false,
}: PupuPurchaseCardProps) {
  const commerce = useMemo(() => createPupuCommerceClient(), []);
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const { payload } = presentation;
  const estimatedTotal = Number.isFinite(payload.estimatedTotal)
    ? Math.max(0, payload.estimatedTotal)
    : 0;
  const userBudget =
    typeof payload.userBudget === "number" &&
    Number.isFinite(payload.userBudget) &&
    payload.userBudget > 0
      ? payload.userBudget
      : null;
  const budgetPercent = userBudget
    ? Math.min(100, (estimatedTotal / userBudget) * 100)
    : null;

  const markImageFailed = (productId: string) => {
    setFailedImages((current) => new Set(current).add(productId));
  };

  return (
    <motion.article
      className="pupu-purchase-card"
      aria-labelledby="pupu-purchase-title"
      data-component={presentation.component}
      data-source={presentation.dataSource}
      data-run-id={runId}
      layoutId={`journey-${instanceId}-pupu-surface`}
      transition={JOURNEY_SPRINGS.groundedSettle}
    >
      <header className="pupu-decision">
        <span className="pupu-decision__eyebrow">助手给你的采购决策</span>
        <h1 id="pupu-purchase-title">
          {payload.meal} · {payload.people} 人
        </h1>

        <div className="pupu-decision__facts" aria-label="方案关键数据">
          <div>
            <small>{userBudget ? "预算" : "预估合计"}</small>
            <strong>
              ¥{estimatedTotal.toFixed(2)}
              {userBudget ? ` / ¥${userBudget.toFixed(2)}` : null}
            </strong>
          </div>
          <div>
            <Clock3 size={15} strokeWidth={1.7} aria-hidden="true" />
            <strong>{payload.estimatedDelivery}</strong>
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

        <ul className="pupu-constraints" aria-label="已满足的约束">
          {payload.constraints.map((constraint) => (
            <li key={constraint}>{constraint}</li>
          ))}
        </ul>

        <p className="pupu-decision__summary">{payload.decisionSummary}</p>
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
            ? "收起商品证据"
            : `查看商品证据（${payload.products.length} 件）`}
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
            {payload.products.map((product, index) => {
              const showFallback =
                !product.imageUrl || failedImages.has(product.productId);
              return (
                <motion.div
                  className="pupu-product"
                  key={product.productId}
                  layoutId={`journey-${instanceId}-pupu-product-${product.productId}`}
                >
                  <span className="pupu-product__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="pupu-product__media">
                    {showFallback ? (
                      <span aria-label="商品暂无图片">
                        <ImageOff
                          size={21}
                          strokeWidth={1.55}
                          aria-hidden="true"
                        />
                      </span>
                    ) : (
                      <img
                        src={product.imageUrl}
                        alt={`${product.name} 商品图`}
                        onError={() => markImageFailed(product.productId)}
                      />
                    )}
                  </div>
                  <div className="pupu-product__copy">
                    <strong>{product.name}</strong>
                    <span>{product.specification}</span>
                    <small>
                      {product.stockStatus === "low_stock"
                        ? "库存紧张"
                        : "有货"}
                    </small>
                  </div>
                  <b>¥{product.unitPrice.toFixed(2)}</b>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {enableCommerce && runId && payload.products.length > 0 && (
        <PupuCartConfirmCard
          products={payload.products}
          onPreview={() => commerce.previewCart(runId, payload.products)}
          onCommit={commerce.commitCart}
        />
      )}

      {!readOnly && onAddToCart && (
        <footer className="pupu-purchase-card__footer">
          <button type="button" onClick={onAddToCart}>
            <ShoppingBasket size={17} strokeWidth={1.9} aria-hidden="true" />
            加入购物车
          </button>
        </footer>
      )}
    </motion.article>
  );
}
