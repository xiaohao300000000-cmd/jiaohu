import { Check, ShieldCheck, ShoppingBasket } from "lucide-react";
import { motion } from "motion/react";
import type { PupuPurchasePayload } from "../agent/agent-ui-event";
import { JOURNEY_SPRINGS } from "../../config/motion";

interface PupuCartCardProps {
  payload: PupuPurchasePayload;
  onSync: () => void;
  status?: string;
}

export function PupuCartCard({ payload, onSync, status }: PupuCartCardProps) {
  const cartVersion = Math.max(1, payload.cartVersion);
  const itemCount = payload.products.reduce((total, product) => total + product.quantity, 0);

  return (
    <motion.article
      className="pupu-purchase-card pupu-cart-card"
      aria-labelledby="pupu-cart-title"
      layoutId="pupu-purchase-surface"
      transition={JOURNEY_SPRINGS.groundedSettle}
    >
      <header className="pupu-decision pupu-cart-card__header">
        <span className="pupu-decision__eyebrow">助手购物车</span>
        <span className="pupu-cart-card__check" aria-hidden="true">
          <Check size={17} strokeWidth={2.2} />
        </span>
        <h1 id="pupu-cart-title">已加入助手购物车</h1>
        <p className="pupu-decision__summary">共 {itemCount} 件商品。这里可以继续调整，尚未写入真实朴朴购物车。</p>
      </header>

      <div className="pupu-cart-summary">
        {payload.products.map((product) => (
          <motion.div
            key={product.productId}
            className="pupu-cart-summary__item"
            layoutId={`pupu-product-${product.productId}`}
          >
            <span>{product.name}</span>
            <small>{product.specification}</small>
            <b>¥{(product.unitPrice * product.quantity).toFixed(2)}</b>
          </motion.div>
        ))}
      </div>

      <footer className="pupu-purchase-card__footer pupu-cart-card__footer">
        <div className="pupu-cart-card__version">
          <ShoppingBasket size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>购物车版本 v{cartVersion}</span>
        </div>
        <div className="pupu-cart-card__total">
          <span>助手购物车合计</span>
          <strong>¥{payload.total.toFixed(2)}</strong>
        </div>
        {status && <p className="pupu-cart-card__status" role="status">{status}</p>}
        <button type="button" onClick={onSync}>
          <ShieldCheck size={17} strokeWidth={1.9} aria-hidden="true" />
          同步到朴朴购物车
        </button>
        <small className="pupu-cart-card__safety">需要再次确认；付款不会在这里自动完成</small>
      </footer>
    </motion.article>
  );
}
