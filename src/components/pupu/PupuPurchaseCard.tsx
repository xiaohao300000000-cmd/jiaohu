import {
  ChevronDown,
  Clock3,
  ImageOff,
  PackageSearch,
  ShoppingBasket,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type {
  AgentUIEvent,
  PupuPurchasePayload,
} from "../agent/agent-ui-event";
import { JOURNEY_SPRINGS } from "../../config/motion";
import "./pupu-purchase.css";

interface PupuPurchaseCardProps {
  event: AgentUIEvent<PupuPurchasePayload>;
  onAddToCart: () => void;
}

export function PupuPurchaseCard({
  event,
  onAddToCart,
}: PupuPurchaseCardProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const { payload } = event;

  const markImageFailed = (productId: string) => {
    setFailedImages((current) => new Set(current).add(productId));
  };

  return (
    <motion.article
      className="pupu-purchase-card"
      aria-labelledby="pupu-purchase-title"
      layoutId="pupu-purchase-surface"
      transition={JOURNEY_SPRINGS.groundedSettle}
    >
      <header className="pupu-decision">
        <span className="pupu-decision__eyebrow">助手给你的采购决策</span>
        <h1 id="pupu-purchase-title">
          {payload.meal} · {payload.people} 人
        </h1>

        <div className="pupu-decision__facts" aria-label="方案关键数据">
          <div>
            <small>预算</small>
            <strong>¥{payload.total.toFixed(2)} / ¥{payload.budget}</strong>
          </div>
          <div>
            <Clock3 size={15} strokeWidth={1.7} aria-hidden="true" />
            <strong>{payload.estimatedDelivery}</strong>
          </div>
        </div>

        <div
          className="pupu-budget-track"
          aria-label={`已使用预算 ${Math.round((payload.total / payload.budget) * 100)}%`}
        >
          <span
            style={{
              width: `${Math.min(100, (payload.total / payload.budget) * 100)}%`,
            }}
          />
        </div>

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
          {evidenceOpen ? "收起商品证据" : `查看商品证据（${payload.products.length} 件）`}
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
            {payload.products.map((product) => {
              const showFallback =
                !product.imageUrl || failedImages.has(product.productId);
              return (
                <motion.div
                  className="pupu-product"
                  key={product.productId}
                  layoutId={`pupu-product-${product.productId}`}
                >
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

      <footer className="pupu-purchase-card__footer">
        <button type="button" onClick={onAddToCart}>
          <ShoppingBasket size={17} strokeWidth={1.9} aria-hidden="true" />
          加入购物车
        </button>
      </footer>
    </motion.article>
  );
}
