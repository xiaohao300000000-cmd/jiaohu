import { ShieldCheck, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import type {
  CommerceTaskIdentity,
  createPupuCommerceClient,
} from "../../ai/pupu-commerce-client";
import type { TaskSnapshot } from "../../domain/task-contract";
import { PupuCheckoutJourney } from "./PupuCheckoutJourney";

type CommerceClient = ReturnType<typeof createPupuCommerceClient>;

interface Props {
  task: TaskSnapshot;
  commerce: CommerceClient;
}

export function PupuCartConfirmCard({
  task: initialTask,
  commerce,
}: Props) {
  const [task, setTask] = useState(initialTask);
  const [preview, setPreview] = useState<{
    confirmationId: string;
    totalCents: number;
  } | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "loading" | "confirm" | "committing" | "verified" | "error"
  >("idle");
  const quantity = task.context.selectedProducts.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const identity = (): CommerceTaskIdentity => ({
    taskId: task.taskId,
    version: task.version,
  });

  async function prepare() {
    setPhase("loading");
    try {
      const result = await commerce.previewCart(identity());
      setPreview(result);
      setTask(result.task);
      setPhase("confirm");
    } catch {
      setPhase("error");
    }
  }

  async function commit() {
    if (!preview) return;
    setPhase("committing");
    try {
      const result = await commerce.commitCart(
        identity(),
        preview.confirmationId,
      );
      setTask(result.task);
      setPhase(result.status === "verified" ? "verified" : "error");
    } catch {
      setPhase("error");
    }
  }

  return (
    <section className="pupu-cart-confirm" aria-label="真实购物车确认">
      <div>
        <ShoppingBasket size={17} aria-hidden="true" />
        <strong>
          {phase === "verified"
            ? "已写入并核对真实购物车"
            : "尚未修改真实购物车"}
        </strong>
      </div>
      {preview && phase !== "verified" && (
        <p role="status">
          将写入 {quantity} 件商品，预计 ¥
          {(preview.totalCents / 100).toFixed(2)}
        </p>
      )}
      {phase === "committing" && (
        <p role="status">正在写入并核对真实购物车，请勿重复操作。</p>
      )}
      {phase === "error" && (
        <p role="alert">
          购物车状态未能确认，请先重新核对，系统不会重复写入。
        </p>
      )}
      {!preview ? (
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={phase === "loading"}
        >
          准备加入购物车
        </button>
      ) : phase !== "verified" ? (
        <button
          type="button"
          onClick={() => void commit()}
          disabled={phase === "committing"}
        >
          <ShieldCheck size={17} aria-hidden="true" />
          确认加入朴朴购物车
        </button>
      ) : null}
      {phase === "verified" && (
        <PupuCheckoutJourney task={task} commerce={commerce} />
      )}
    </section>
  );
}
