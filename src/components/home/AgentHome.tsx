import { ArrowUp, ShoppingBasket, Utensils } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { JOURNEY_SPRINGS } from "../../config/motion";
import type { TaskPresentation } from "./presentation";
import { QuickResultCard } from "./QuickResultCard";
import "./agent-home.css";

interface AgentHomeProps {
  activeTask: TaskPresentation | null;
  onSubmit: (input: string) => void;
  onExampleSelect: (input: string) => void;
}

const examples = [
  { label: "朴朴帮我买", icon: ShoppingBasket },
  { label: "今晚吃什么", icon: Utensils },
  { label: "确认退款", icon: ShoppingBasket },
];

export function AgentHome({
  activeTask,
  onSubmit,
  onExampleSelect,
}: AgentHomeProps) {
  const [input, setInput] = useState("");
  const anchoredTask = activeTask?.mode === "anchored" ? activeTask : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    onSubmit(value);
    setInput("");
  };

  return (
    <MotionConfig reducedMotion="user">
      <section className={`agent-home${anchoredTask ? " agent-home--answered" : ""}`}>
        <motion.div className="agent-home__intro" layout transition={JOURNEY_SPRINGS.quickSnappy}>
          <p className="agent-home__kicker">随时可以开始</p>
          <h1>今天想让我做什么？</h1>
          <p>吃什么、买什么、查快递或看看外卖进度，都可以直接说。</p>
        </motion.div>

        <motion.div className="agent-home__conversation" layout transition={JOURNEY_SPRINGS.quickSnappy}>
          <form className="home-composer" data-testid="home-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="home-instruction">输入生活指令</label>
            <input
              id="home-instruction"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={anchoredTask ? "继续问一问" : "说说你现在想做什么"}
              autoComplete="off"
            />
            <button type="submit" aria-label="发送指令">
              <ArrowUp size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>

          <AnimatePresence initial={false} mode="popLayout">
            {anchoredTask && (
              <motion.div
                key={`${anchoredTask.kind}-${anchoredTask.input}`}
                className="anchored-result"
                data-testid="anchored-result"
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.985 }}
                transition={JOURNEY_SPRINGS.quickSnappy}
              >
                <p className="anchored-result__request">“{anchoredTask.input}”</p>
                <QuickResultCard kind={anchoredTask.kind} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence initial={false}>
          {!anchoredTask && (
            <motion.div
              className="agent-home__examples"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <span>试着这样说</span>
              <div>
                {examples.map(({ label, icon: Icon }) => (
                  <button key={label} type="button" onClick={() => onExampleSelect(label)}>
                    <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </MotionConfig>
  );
}
