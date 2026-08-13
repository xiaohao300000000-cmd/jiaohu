import { Check, LoaderCircle, MapPin } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import type { SavedPupuAddress } from "../../ai/pupu-address-client";
import { JOURNEY_SPRINGS } from "../../config/motion";
import "./pupu-login.css";

interface Props {
  instanceId: string;
  phase: "loading" | "choose" | "selecting" | "selected" | "error";
  addresses: SavedPupuAddress[];
  onSelect?: (receiverId: string) => void;
  onRetry?: () => void;
}

export function PupuAddressJourney({
  instanceId, phase, addresses, onSelect, onRetry,
}: Props) {
  const selected = addresses[0];
  return (
    <MotionConfig reducedMotion="user">
      <motion.article
        className="pupu-login"
        data-component="pupu.address"
        data-phase={phase}
        layoutId={`journey-${instanceId}-pupu-address`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={JOURNEY_SPRINGS.groundedSettle}
      >
        <header className="pupu-login__header">
          <span className="pupu-login__icon"><MapPin size={18} aria-hidden="true" /></span>
          <div>
            <span className="pupu-login__eyebrow">DELIVERY ADDRESS</span>
            <h2>这次送到哪里？</h2>
          </div>
        </header>
        {(phase === "loading" || phase === "selecting") && (
          <div className="pupu-login__busy" role="status">
            <LoaderCircle className="pupu-login__spinner" size={19} aria-hidden="true" />
            <strong>{phase === "loading" ? "正在读取已保存地址" : "正在确认配送地址"}</strong>
            <span>只会显示保护后的门牌提示</span>
          </div>
        )}
        {phase === "choose" && (
          <div className="pupu-login__form">
            <p>下单前先选择朴朴账号中已有的收货地址。首版暂不支持新增或修改。</p>
            {addresses.map((address) => (
              <button key={address.id} type="button" onClick={() => onSelect?.(address.id)}>
                <MapPin size={16} aria-hidden="true" />
                <span>{address.label}</span>
                <span>{address.detailHint}</span>
              </button>
            ))}
          </div>
        )}
        {phase === "selected" && selected && (
          <div className="pupu-login__connected" role="status">
            <Check size={20} aria-hidden="true" />
            <strong>地址已确认 · {selected.label}</strong>
            <span>正在继续刚才的需求</span>
          </div>
        )}
        {phase === "error" && (
          <div className="pupu-login__warning" role="alert">
            <strong>暂时无法确认地址</strong>
            <button type="button" onClick={onRetry}>重新读取</button>
          </div>
        )}
      </motion.article>
    </MotionConfig>
  );
}
