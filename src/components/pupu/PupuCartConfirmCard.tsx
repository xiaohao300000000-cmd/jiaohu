import { ShieldCheck, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import type { ProductSummary } from "../agent/agent-ui-event";
import { PupuCheckoutJourney } from "./PupuCheckoutJourney";
import { createPupuCommerceClient } from "../../ai/pupu-commerce-client";

interface Preview { previewId: string; version: number; totalCents: number }
interface Props {
  products: ProductSummary[];
  onPreview: () => Promise<Preview>;
  onCommit: (preview: Pick<Preview, "previewId" | "version">) => Promise<{ status: string }>;
}
export function PupuCartConfirmCard({ products, onPreview, onCommit }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [commerce] = useState(() => createPupuCommerceClient());
  const [phase, setPhase] = useState<"idle" | "loading" | "confirm" | "committing" | "verified" | "error">("idle");
  const quantity = products.reduce((sum, item) => sum + item.quantity, 0);
  async function prepare() {
    setPhase("loading");
    try { setPreview(await onPreview()); setPhase("confirm"); }
    catch { setPhase("error"); }
  }
  async function commit() {
    if (!preview) return;
    setPhase("committing");
    try {
      const result = await onCommit({ previewId: preview.previewId, version: preview.version });
      setPhase(result.status === "verified" ? "verified" : "error");
    } catch { setPhase("error"); }
  }
  return (
    <section className="pupu-cart-confirm" aria-label="真实购物车确认">
      <div>
        <ShoppingBasket size={17} aria-hidden="true" />
        <strong>{phase === "verified" ? "已写入并核对真实购物车" : "尚未修改真实购物车"}</strong>
      </div>
      {preview && phase !== "verified" && (
        <p role="status">将写入 {quantity} 件商品，预计 ¥{(preview.totalCents / 100).toFixed(2)}</p>
      )}
      {phase === "committing" && (
        <p role="status">正在写入并核对真实购物车，请勿重复操作。</p>
      )}
      {phase === "error" && <p role="alert">购物车状态未能确认，请先重新核对，系统不会重复写入。</p>}
      {!preview ? (
        <button type="button" onClick={() => void prepare()} disabled={phase === "loading"}>
          准备加入购物车
        </button>
      ) : phase !== "verified" ? (
        <button type="button" onClick={() => void commit()} disabled={phase === "committing"}>
          <ShieldCheck size={17} aria-hidden="true" />
          确认加入朴朴购物车
        </button>
      ) : null}
      {phase === "verified" && (
        <PupuCheckoutJourney
          onPreview={commerce.previewCheckout}
          onCreate={commerce.createInvitePay}
        />
      )}
    </section>
  );
}
