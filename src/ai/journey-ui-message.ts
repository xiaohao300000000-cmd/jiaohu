import type { UIMessage } from "ai";
import type { JourneyEvent } from "../components/journey/types";

export type JourneyUIMessage = UIMessage<
  { runId: string },
  { journey: JourneyEvent }
>;
