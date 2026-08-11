import type {
  AgentDataSource,
  PupuPurchasePayload,
} from "../agent/agent-ui-event";
import type { PresentationMode } from "../home/presentation";

export type JourneyState =
  | "idle"
  | "receiving"
  | "reasoning"
  | "assembling"
  | "ready"
  | "awaiting_input"
  | "error"
  | "interrupted";

export type TraceStatus = "pending" | "active" | "complete";

export interface TraceEntry {
  id: string;
  label: string;
  detail?: string;
  status: TraceStatus;
}

export interface JourneyResultItem {
  id: string;
  name: string;
  detail: string;
  price: number;
}

export interface PartialJourneyResult {
  title?: string;
  summary?: string;
  totalAmount?: number;
  currency?: string;
  items?: JourneyResultItem[];
}

export interface JourneyResult {
  title: string;
  summary: string;
  totalAmount: number;
  currency: string;
  items: JourneyResultItem[];
}

export type PupuJourneyPayload = Omit<
  PupuPurchasePayload,
  "budget" | "total"
> & {
  estimatedTotal: number;
  userBudget?: number;
};

export type PupuLoginPhase =
  | "phone" | "requesting" | "captcha" | "applying_captcha"
  | "sms" | "verifying" | "connected" | "error";

export interface PupuLoginPresentation {
  phase: PupuLoginPhase;
  attemptId?: string;
  captchaUrl?: string;
  retryAfterSeconds?: number;
  error?: { code: string; message: string; retryable: boolean };
}
export type JourneyPresentation =
  | {
      capability: "pupu";
      component: "pupu.purchase-plan";
      mode: PresentationMode;
      dataSource: AgentDataSource;
      payload: PupuJourneyPayload;
    }
  | {
      capability: "pupu";
      component: "pupu.login";
      mode: PresentationMode;
      dataSource: "live";
      payload: PupuLoginPresentation;
    }
  | {
      capability: "generic";
      component: "journey.result";
      mode: PresentationMode;
      dataSource: "live";
      payload: JourneyResult;
    };

export type AwaitingInput =
  | {
      kind: "approval";
      title: string;
      impact: string;
      target: string;
      amount?: number;
      currency?: string;
      approvalId: string;
    }
  | {
      kind: "clarification";
      title: string;
      question: string;
    };

export type JourneyErrorKind =
  "offline" | "timeout" | "provider" | "invalid_result" | "unknown";

export interface JourneyError {
  kind: JourneyErrorKind;
  message: string;
  reference?: string;
}

export type JourneyEvent =
  | { type: "request.sent"; requestId: string; text: string }
  | { type: "stream.started"; requestId: string; runId: string }
  | {
      type: "presentation.updated";
      requestId: string;
      presentation: JourneyPresentation;
    }
  | { type: "trace.updated"; requestId: string; entries: TraceEntry[] }
  | {
      type: "result.partial";
      requestId: string;
      result: PartialJourneyResult;
    }
  | {
      type: "approval.requested";
      requestId: string;
      input: AwaitingInput;
    }
  | {
      type: "approval.responded";
      requestId: string;
      approved: boolean;
    }
  | {
      type: "stream.finished";
      requestId: string;
      result: JourneyResult;
    }
  | {
      type: "stream.failed";
      requestId: string;
      error: JourneyError;
    }
  | {
      type: "stream.interrupted";
      requestId: string;
      replacementRequestId?: string;
    }
  | { type: "retry.requested"; requestId: string };

export interface JourneySnapshot {
  state: JourneyState;
  activeRequestId: string | null;
  requestText: string;
  runId: string | null;
  trace: TraceEntry[];
  partialResult: PartialJourneyResult | null;
  result: JourneyResult | null;
  awaitingInput: AwaitingInput | null;
  presentation: JourneyPresentation | null;
  error: JourneyError | null;
  replacementRequestId: string | null;
}
