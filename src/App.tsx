import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import { useLiveJourney } from "./ai/useLiveJourney";
import { AgentHome } from "./components/home/AgentHome";
import { FloatingComposer } from "./components/home/FloatingComposer";
import type { TaskPresentation } from "./components/home/presentation";
import { JourneyOriginSurface } from "./components/journey/JourneyOriginSurface";
import { LiquidJourney } from "./components/journey/LiquidJourney";
import { PupuPurchaseCard } from "./components/pupu/PupuPurchaseCard";
import { JOURNEY_SPRINGS } from "./config/motion";

export default function App() {
  const [activeTask, setActiveTask] = useState<TaskPresentation | null>(null);
  const {
    snapshot,
    pupuEvent,
    status,
    submit,
    stop,
    retry,
    reset,
  } = useLiveJourney();

  const startTask = (input: string) => {
    const normalized = input.trim();
    if (!normalized) return;
    setActiveTask({ mode: "canvas", kind: "plan", input: normalized });
    void submit(normalized);
  };

  const resetHome = () => {
    void stop();
    reset();
    setActiveTask(null);
  };

  const isCanvas = activeTask?.mode === "canvas";
  const isRunning = status === "submitted" || status === "streaming";

  return (
    <div className="app-shell">
      <header className={`app-header${isCanvas ? " app-header--canvas" : ""}`}>
        <div className="app-header__inner">
          {isCanvas ? (
            <>
              <span className="app-header__canvas-status">
                {snapshot.state === "ready"
                  ? "Agent 决策已完成"
                  : "Hermes 正在处理"}
              </span>
              <button
                className="app-header__return"
                type="button"
                onClick={resetHome}
              >
                返回首页
              </button>
            </>
          ) : (
            <>
              <a
                className="app-brand"
                href="#home"
                aria-label="Pupu 首页"
                onClick={resetHome}
              >
                Pupu
              </a>
              <span className="app-header__status">Hermes 实时只读</span>
            </>
          )}
        </div>
      </header>

      <main
        id="home"
        className={`app-main${isCanvas ? " app-main--canvas" : ""}`}
      >
        <LayoutGroup id="agent-journey">
          {isCanvas && activeTask ? (
            <motion.section
              className="canvas-shell"
              key="canvas"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={JOURNEY_SPRINGS.quickSnappy}
            >
              <div
                className="task-scroll-space"
                data-testid="task-scroll-space"
              >
                <JourneyOriginSurface
                  requestText={activeTask.input}
                  state={snapshot.state}
                >
                  {pupuEvent ? (
                    <PupuPurchaseCard event={pupuEvent} readOnly />
                  ) : (
                    <LiquidJourney
                      snapshot={snapshot}
                      onRetry={() => void retry()}
                    />
                  )}
                </JourneyOriginSurface>
              </div>
              <FloatingComposer
                onSubmit={startTask}
                busy={isRunning}
                onStop={() => void stop()}
              />
            </motion.section>
          ) : (
            <div key="home">
              <AgentHome
                activeTask={null}
                onSubmit={startTask}
                onExampleSelect={startTask}
              />
            </div>
          )}
        </LayoutGroup>
      </main>

      {!isCanvas && (
        <footer className="app-footer">
          <span>Hermes 实时通道 · 朴朴首版只读模式</span>
        </footer>
      )}
    </div>
  );
}
