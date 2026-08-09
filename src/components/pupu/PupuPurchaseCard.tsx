import { Clock3, ImageOff, ShoppingBasket } from "lucide-react";
import { motion } from "motion/react";
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
      <header className="pupu-purchase-card__header">
        <div>
          <span className="pupu-purchase-card__eyebrow">PUPU PURCHASE PLAN</span>
          <span className="pupu-source">示例数据</span>
        </div>
        <h1 id="pupu-purchase-title">{payload.title}</h1>
        <p>{payload.summary}</p>
      </header>

      <div className="pupu-product-list">
        {payload.products.map((product) => {
          const showFallback = !product.imageUrl || failedImages.has(product.productId);
          return (
            <motion.div
              className="pupu-product"
              key={product.productId}
              layoutId={`pupu-product-${product.productId}`}
            >
              <div className="pupu-product__media">
                {showFallback ? (
                  <span aria-label="商品暂无图片">
                    <ImageOff size={21} strokeWidth={1.55} aria-hidden="true" />
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
                  {product.stockStatus === "low_stock" ? "库存紧张" : "有货"}
                </small>
              </div>
              <b>¥{product.unitPrice.toFixed(2)}</b>
            </motion.div>
          );
        })}
      </div>

      <footer className="pupu-purchase-card__footer">
        <div className="pupu-delivery-note">
          <Clock3 size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>{payload.estimatedDelivery}</span>
        </div>
        <div className="pupu-purchase-card__total">
          <span>合计</span>
          <strong>合计 ¥{payload.total.toFixed(2)}</strong>
        </div>
        <button type="button" onClick={onAddToCart}>
          <ShoppingBasket size={17} strokeWidth={1.9} aria-hidden="true" />
          加入购物车
        </button>
      </footer>
    </motion.article>
  );
}
