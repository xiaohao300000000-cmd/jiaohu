import type { ReactNode } from "react";
import { LiquidJourney } from "./LiquidJourney";
import type { JourneyPresentation, JourneySnapshot } from "./types";
import { PupuPurchaseCard } from "../pupu/PupuPurchaseCard";
import { PupuLoginJourney } from "../pupu/PupuLoginJourney";
import { PupuAddressJourney } from "../pupu/PupuAddressJourney";

type PupuPresentation = Extract<
  JourneyPresentation,
  { component: "pupu.purchase-plan" }
>;

interface PresentationRendererContext {
  instanceId: string;
  runId?: string;
  readOnly: boolean;
  task: JourneySnapshot["task"];
}

type PupuRenderer = (
  presentation: PupuPresentation,
  context: PresentationRendererContext,
) => ReactNode;

const presentationRenderers = {
  "pupu.purchase-plan": ((presentation, context) => (
    <PupuPurchaseCard
      presentation={presentation}
      instanceId={context.instanceId}
      runId={context.runId}
      readOnly={context.readOnly}
      enableCommerce={!context.readOnly}
      task={context.task}
    />
  )) satisfies PupuRenderer,
};

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
  if (presentation?.component === "pupu.purchase-plan") {
    return presentationRenderers["pupu.purchase-plan"](presentation, {
      instanceId: snapshot.activeRequestId || "idle",
      runId: snapshot.runId || undefined,
      readOnly: false,
      task: snapshot.task,
    });
  }

  return <LiquidJourney snapshot={snapshot} onRetry={onRetry} />;
}
