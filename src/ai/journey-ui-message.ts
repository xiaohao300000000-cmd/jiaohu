import type { UIMessage } from "ai";
import type {
  AgentUIEvent,
  PupuPurchasePayload,
} from "../components/agent/agent-ui-event";
import type { JourneyEvent } from "../components/journey/types";

export type JourneyDataPart =
  | { type: "journey-event"; data: JourneyEvent }
  | { type: "pupu-event"; data: AgentUIEvent<PupuPurchasePayload> };

export type JourneyUIMessage = UIMessage<
  { runId: string },
  {
    journey: JourneyEvent;
    pupu: AgentUIEvent<PupuPurchasePayload>;
  }
>;
