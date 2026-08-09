import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { createDemoPupuPurchaseEvent } from "./components/agent/agent-ui-event";
import { AgentHome } from "./components/home/AgentHome";
import {
  resolveDemoPresentation,
  type TaskPresentation,
} from "./components/home/presentation";
import { TaskSheet } from "./components/home/TaskSheet";
import { JourneyApproval } from "./components/journey/JourneyApproval";
import { LiquidJourney } from "./components/journey/LiquidJourney";
import { useJourneyDemo } from "./components/journey/useJourneyDemo";
import { PupuPurchaseCard } from "./components/pupu/PupuPurchaseCard";
import { PupuCartCard } from "./components/pupu/PupuCartCard";
import { JOURNEY_SPRINGS } from "./config/motion";

function CanvasComposer({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = value.trim();
    if (!next) return;
    onSubmit(next);
    setValue("");
  };

  return (
    <form className="canvas-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="canvas-instruction">输入新的生活指令</label>
      <input
        id="canvas-instruction"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="继续追问，或输入新指令"
      />
      <button type="submit" aria-label="发送新指令">
        <ArrowUp size={17} strokeWidth={2} aria-hidden="true" />
      </button>
    </form>
  );
}

export default function App() {
  const [activeTask, setActiveTask] = useState<TaskPresentation | null>(null);
  const [pupuCartAdded, setPupuCartAdded] = useState(false);
  const [pupuSyncOpen, setPupuSyncOpen] = useState(false);
  const [pupuSyncStatus, setPupuSyncStatus] = useState("");
  const {
    snapshot,
    startStandard,
    playApproval,
    respondToApproval,
    submitClarification,
    retry,
    completeInterruptionExit,
  } = useJourneyDemo({ autoPlay: false });

  const resetHome = () => {
    setActiveTask(null);
    setPupuCartAdded(false);
    setPupuSyncOpen(false);
    setPupuSyncStatus("");
  };

  const startTask = (input: string) => {
    const next = resolveDemoPresentation(input);
    setActiveTask(next);
    setPupuCartAdded(false);
    setPupuSyncOpen(false);
    setPupuSyncStatus("");

    if (next.mode === "canvas" && next.kind !== "pupu_purchase") {
      startStandard(next.input);
    } else if (next.mode === "sheet") {
      playApproval(next.input, {
        kind: "approval",
        approvalId: `demo-approval-${Date.now()}`,
        title: next.input.includes("退款") ? "确认退款申请" : "确认高风险操作",
        impact: next.input.includes("退款")
          ? "提交后将进入退款流程，款项不会立即到账。"
          : "确认后将提交操作，但此前端演示不会真实扣款。",
        target: "示例订单 · 未连接真实账户",
        amount: 68,
        currency: "CNY",
      });
    }
  };

  const resolveApproval = (approved: boolean) => {
    respondToApproval(approved);
    if (pupuSyncOpen) {
      setPupuSyncOpen(false);
      setPupuSyncStatus(
        approved
          ? "演示确认完成，未执行真实同步"
          : "已取消同步，助手购物车保持不变",
      );
      return;
    }
    setActiveTask(null);
  };

  const requestPupuSync = () => {
    if (!pupuPurchaseEvent) return;
    setPupuSyncOpen(true);
    playApproval("确认同步到朴朴购物车", {
      kind: "approval",
      approvalId: `pupu-cart-sync-${Date.now()}`,
      title: "确认同步到朴朴购物车",
      impact: "确认后才允许能力提供方尝试同步；当前演示不会修改真实朴朴购物车。",
      target: "助手购物车 v1 · 未连接真实账户",
      amount: pupuPurchaseEvent.payload.total,
      currency: "CNY",
    });
  };

  const isCanvas = activeTask?.mode === "canvas";
  const isSheet = activeTask?.mode === "sheet" || pupuSyncOpen;
  const isPupuPurchase = activeTask?.kind === "pupu_purchase";
  const pupuPurchaseEvent = useMemo(
    () =>
      isPupuPurchase && activeTask
        ? createDemoPupuPurchaseEvent(activeTask.input)
        : null,
    [activeTask, isPupuPurchase],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <a
            className="app-brand"
            href="#home"
            aria-label="Pupu 首页"
            onClick={resetHome}
          >
            Pupu
          </a>
          <span className="app-header__status">前端交互模板</span>
        </div>
      </header>

      <main id="home" className={`app-main${isCanvas ? " app-main--canvas" : ""}`}>
        <AnimatePresence initial={false} mode="wait">
          {isCanvas ? (
            <motion.section
              className="canvas-shell"
              key="canvas"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={JOURNEY_SPRINGS.quickSnappy}
            >
              {isPupuPurchase && pupuPurchaseEvent ? (
                <AnimatePresence initial={false} mode="wait">
                  {pupuCartAdded ? (
                    <PupuCartCard
                      key="pupu-cart"
                      payload={{
                        ...pupuPurchaseEvent.payload,
                        stage: "cart_updated",
                        cartVersion: 1,
                      }}
                      status={pupuSyncStatus}
                      onSync={requestPupuSync}
                    />
                  ) : (
                    <PupuPurchaseCard
                      key="pupu-plan"
                      event={pupuPurchaseEvent}
                      onAddToCart={() => setPupuCartAdded(true)}
                    />
                  )}
                </AnimatePresence>
              ) : (
                <LiquidJourney
                  snapshot={snapshot}
                  onApprovalResponse={resolveApproval}
                  onClarificationSubmit={submitClarification}
                  onRetry={retry}
                  onInterruptedExitComplete={completeInterruptionExit}
                />
              )}
              <CanvasComposer onSubmit={startTask} />
            </motion.section>
          ) : (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={JOURNEY_SPRINGS.quickSnappy}
            >
              <AgentHome
                activeTask={activeTask}
                onSubmit={startTask}
                onExampleSelect={startTask}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {!isCanvas && (
        <footer className="app-footer">
          <span>当前为示例界面，尚未连接 Agent</span>
        </footer>
      )}

      <TaskSheet
        open={isSheet}
        onClose={() => {
          if (pupuSyncOpen) {
            setPupuSyncOpen(false);
          } else {
            resetHome();
          }
        }}
      >
        {snapshot.state === "awaiting_input" && snapshot.awaitingInput ? (
          <JourneyApproval
            input={snapshot.awaitingInput}
            onApprovalResponse={resolveApproval}
            onClarificationSubmit={submitClarification}
          />
        ) : (
          <div className="task-sheet__pending" role="status">
            <span>正在准备确认信息</span>
            <h2>{pupuSyncOpen ? "确认同步到朴朴购物车" : activeTask?.input}</h2>
            <p>正在检查操作对象和影响范围，确认前不会执行任何操作。</p>
          </div>
        )}
      </TaskSheet>
    </div>
  );
}
