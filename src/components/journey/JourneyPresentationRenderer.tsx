import { LiquidJourney } from "./LiquidJourney";
import type { JourneySnapshot } from "./types";
import { PupuPurchaseCard } from "../pupu/PupuPurchaseCard";
import { PupuLoginJourney } from "../pupu/PupuLoginJourney";
import { PupuAddressJourney } from "../pupu/PupuAddressJourney";

interface JourneyPresentationRendererProps {
  snapshot: JourneySnapshot;
  onRetry?: () => void;
  onLoginPhone?: (phone: string) => void;
  onLoginCode?: (code: string) => void;
  onLoginCaptchaComplete?: () => void;
  onLoginResend?: () => void;
  onLoginCancel?: () => void;
  onAddressSelect?: (receiverId: string) => void;
  onAddressRetry?: () => void;
}

const FINAL_PLAN_PHASES = new Set([
  "awaiting_cart_confirmation",
  "writing_cart",
  "awaiting_order_confirmation",
  "creating_order",
  "awaiting_payment",
  "completed",
]);

export function JourneyPresentationRenderer({
  snapshot,
  onRetry,
  onLoginPhone,
  onLoginCode,
  onLoginCaptchaComplete,
  onLoginResend,
  onLoginCancel,
  onAddressSelect,
  onAddressRetry,
}: JourneyPresentationRendererProps) {
  const presentation = snapshot.presentation;
  if (presentation?.component === "pupu.login") {
    return (
      <PupuLoginJourney
        instanceId={snapshot.activeRequestId || "idle"}
        presentation={presentation.payload}
        onPhoneSubmit={onLoginPhone}
        onCodeSubmit={onLoginCode}
        onCaptchaComplete={onLoginCaptchaComplete}
        onResend={onLoginResend}
        onCancel={onLoginCancel}
      />
    );
  }
  if (presentation?.component === "pupu.address") {
    return (
      <PupuAddressJourney
        instanceId={snapshot.activeRequestId || "idle"}
        phase={presentation.payload.phase}
        addresses={presentation.payload.addresses}
        onSelect={onAddressSelect}
        onRetry={onAddressRetry}
      />
    );
  }
  if (
    snapshot.task?.finalPlan &&
    snapshot.task.context.selectedProducts.length > 0 &&
    FINAL_PLAN_PHASES.has(snapshot.task.phase)
  ) {
    return (
      <PupuPurchaseCard
        task={snapshot.task}
        instanceId={snapshot.activeRequestId || "idle"}
      />
    );
  }

  return <LiquidJourney snapshot={snapshot} onRetry={onRetry} />;
}
