import { ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import { useState } from "react";

export interface CheckoutPreview {
  previewId: string; version: number; addressHint: string;
  lines: Array<{ name: string; quantity: number; priceCents: number }>;
  productTotalCents: number; deliveryFeeCents: number; discountCents: number;
  payableCents: number; deliveryHint?: string; expiresAt: string;
}
export interface PaymentPresentation {
  checkoutId: string; status: "WAITING_PAY"; payableCents: number;
  paymentTarget: string; expiresAt?: string;
}
interface Props {
  onPreview: () => Promise<CheckoutPreview>;
  onCreate: (preview: Pick<CheckoutPreview, "previewId" | "version">) => Promise<PaymentPresentation>;
}
export function PupuCheckoutJourney({ onPreview, onCreate }: Props) {
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [payment, setPayment] = useState<PaymentPresentation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { setPreview(await onPreview()); } catch { setError("暂时无法核对结算金额，真实订单没有创建。"); }
    finally { setBusy(false); }
  }
  async function create() {
    if (!preview) return;
    setBusy(true); setError("");
    try { setPayment(await onCreate({ previewId: preview.previewId, version: preview.version })); }
    catch { setError("订单结果未能确认。请勿重复下单，先重新查询当前状态。"); }
    finally { setBusy(false); }
  }
  if (payment) {
    return (
      <section className="pupu-checkout" aria-label="朴朴待付款订单">
        <div className="pupu-checkout__status"><ShieldCheck size={18} aria-hidden="true" /><strong>真实待付款订单已创建</strong></div>
        <h2>待付款 ¥{(payment.payableCents / 100).toFixed(2)}</h2>
        <p>WAITING_PAY · 尚未付款</p>
        <a href={payment.paymentTarget} rel="noopener noreferrer">
          <ExternalLink size={17} aria-hidden="true" />去朴朴官方付款
        </a>
        <small>点击只会打开朴朴官方页面；系统不会代你付款，也不会因点击而标记成功。</small>
      </section>
    );
  }
  return (
    <section className="pupu-checkout" aria-label="朴朴结算确认">
      {!preview ? (
        <button type="button" onClick={() => void load()} disabled={busy}>
          <ReceiptText size={17} aria-hidden="true" />查看实时结算金额
        </button>
      ) : (
        <>
          <span>{preview.addressHint}</span>
          <h2>待付款 ¥{(preview.payableCents / 100).toFixed(2)}</h2>
          <dl>
            <div><dt>商品</dt><dd>¥{(preview.productTotalCents / 100).toFixed(2)}</dd></div>
            <div><dt>配送费</dt><dd>¥{(preview.deliveryFeeCents / 100).toFixed(2)}</dd></div>
            <div><dt>优惠</dt><dd>-¥{(preview.discountCents / 100).toFixed(2)}</dd></div>
          </dl>
          <p>这一步尚未创建订单</p>
          <button type="button" onClick={() => void create()} disabled={busy}>
            <ShieldCheck size={17} aria-hidden="true" />确认并创建真实待付款订单
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
