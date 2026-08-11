import type { ReactNode } from "react";
import { LiquidJourney } from "./LiquidJourney";
import type { JourneyPresentation, JourneySnapshot } from "./types";
import { PupuPurchaseCard } from "../pupu/PupuPurchaseCard";

type PupuPresentation = Extract<
  JourneyPresentation,
  { component: "pupu.purchase-plan" }
>;

interface PresentationRendererContext {
  instanceId: string;
  runId?: string;
  readOnly: boolean;
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
    />
  )) satisfies PupuRenderer,
};

interface JourneyPresentationRendererProps {
  snapshot: JourneySnapshot;
  onRetry?: () => void;
}

export function JourneyPresentationRenderer({
  snapshot,
  onRetry,
}: JourneyPresentationRendererProps) {
  const presentation = snapshot.presentation;
  if (presentation?.component === "pupu.purchase-plan") {
    return presentationRenderers["pupu.purchase-plan"](presentation, {
      instanceId: snapshot.activeRequestId || "idle",
      runId: snapshot.runId || undefined,
      readOnly: true,
    });
  }

  return <LiquidJourney snapshot={snapshot} onRetry={onRetry} />;
}
