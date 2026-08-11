import { ArrowRight, Check, LoaderCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { JOURNEY_SPRINGS } from "../../config/motion";
import "./pupu-login.css";

import type { PupuLoginPhase, PupuLoginPresentation } from "../journey/types";

interface Props {
  instanceId: string;
  presentation: PupuLoginPresentation;
  onPhoneSubmit?: (phone: string) => void;
  onCodeSubmit?: (code: string) => void;
  onCaptchaComplete?: () => void;
  onResend?: () => void;
  onCancel?: () => void;
}

const busyCopy: Partial<Record<PupuLoginPhase, string>> = {
  requesting: "正在向朴朴请求真实登录验证",
  applying_captcha: "正在确认滑块结果并请求短信",
  verifying: "正在验证短信并保存登录状态",
};

export function PupuLoginJourney({
  instanceId,
  presentation,
  onPhoneSubmit,
  onCodeSubmit,
  onCaptchaComplete,
  onResend,
  onCancel,
}: Props) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const safeCaptcha = presentation.captchaUrl &&
    /^\/api\/pupu\/login\/captcha\/[A-Za-z0-9-]{1,64}\/?$/.test(presentation.captchaUrl)
    ? presentation.captchaUrl
    : null;

  const submitPhone = (event: FormEvent) => {
    event.preventDefault();
    if (/^1\d{10}$/.test(phone)) onPhoneSubmit?.(phone);
  };
  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (/^\d{4,8}$/.test(code)) onCodeSubmit?.(code);
  };

  return (
    <MotionConfig reducedMotion="user">
      <motion.article
        className="pupu-login"
        data-component="pupu.login"
        data-phase={presentation.phase}
        layoutId={`journey-${instanceId}-pupu-login`}
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={JOURNEY_SPRINGS.groundedSettle}
      >
        <header className="pupu-login__header">
          <span className="pupu-login__icon"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div>
            <span className="pupu-login__eyebrow">PUPU SECURE CONNECTION</span>
            <h2>连接你的朴朴账号</h2>
          </div>
        </header>

        {presentation.phase === "phone" && (
          <form aria-label="朴朴登录" className="pupu-login__form" onSubmit={submitPhone}>
            <p>首次使用朴朴能力前，需要由你本人完成登录。手机号不会发给 AI。</p>
            <label htmlFor={`pupu-phone-${instanceId}`}>手机号</label>
            <input
              id={`pupu-phone-${instanceId}`}
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="请输入本人的手机号"
            />
            <button type="submit" disabled={!/^1\d{10}$/.test(phone)}>
              继续验证 <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
        )}

        {busyCopy[presentation.phase] && (
          <div className="pupu-login__busy" role="status" aria-live="polite">
            <LoaderCircle className="pupu-login__spinner" size={19} aria-hidden="true" />
            <strong>{busyCopy[presentation.phase]}</strong>
            <span>请保持当前页面打开</span>
          </div>
        )}

        {presentation.phase === "captcha" && (
          <div className="pupu-login__captcha">
            <p>请完成朴朴官方安全滑块。结果只会回传到当前会话。</p>
            {safeCaptcha ? (
              <iframe title="朴朴安全验证" src={safeCaptcha} sandbox="allow-scripts allow-forms allow-same-origin" />
            ) : (
              <div role="alert" className="pupu-login__warning">安全验证地址无效，请重新开始。</div>
            )}
            <button type="button" onClick={onCaptchaComplete} disabled={!safeCaptcha}>
              我已完成验证 <Check size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {presentation.phase === "sms" && (
          <form aria-label="短信验证" className="pupu-login__form" onSubmit={submitCode}>
            <p>短信已由朴朴真实发送。验证码只通过安全登录通道提交。</p>
            <label htmlFor={`pupu-code-${instanceId}`}>短信验证码</label>
            <input
              id={`pupu-code-${instanceId}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="输入短信验证码"
            />
            <button type="submit" disabled={!/^\d{4,8}$/.test(code)}>验证并继续</button>
            <button className="pupu-login__link" type="button" onClick={onResend}
              disabled={(presentation.retryAfterSeconds || 0) > 0}>
              <RotateCcw size={14} aria-hidden="true" />
              {presentation.retryAfterSeconds ? `${presentation.retryAfterSeconds} 秒后可重发` : "重新发送"}
            </button>
          </form>
        )}

        {presentation.phase === "connected" && (
          <div className="pupu-login__connected" role="status">
            <Check size={20} aria-hidden="true" />
            <strong>朴朴已连接</strong>
            <span>正在继续刚才的任务，只会执行一次。</span>
          </div>
        )}

        {presentation.phase === "error" && (
          <div className="pupu-login__warning" role="alert">
            <strong>登录暂时没有完成</strong>
            <span>{presentation.error?.message || "请重试当前步骤。"}</span>
          </div>
        )}

        <button className="pupu-login__cancel" type="button" onClick={onCancel}>
          <X size={14} aria-hidden="true" /> 取消本次登录
        </button>
      </motion.article>
    </MotionConfig>
  );
}

